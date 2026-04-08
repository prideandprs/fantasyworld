/**
 * ═══════════════════════════════════════════════════════════════
 * SafeNow Lead User Panel — Mailjet API Proxy
 * ═══════════════════════════════════════════════════════════════
 *
 * Kleiner Express-Server, der als Proxy zwischen Frontend und
 * Mailjet API fungiert. Notwendig weil:
 *  1. Mailjet kein CORS unterstützt
 *  2. API-Keys nicht im Frontend liegen dürfen
 *
 * Setup:
 *   npm install express cors node-fetch@2
 *   MJ_APIKEY_PUBLIC=xxx MJ_APIKEY_PRIVATE=yyy node mailjet-proxy.js
 *
 * Oder mit .env-Datei (npm install dotenv):
 *   node -r dotenv/config mailjet-proxy.js
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Config ───
const MJ_API = 'https://api.mailjet.com/v3/REST';
const MJ_PUBLIC = process.env.MJ_APIKEY_PUBLIC;
const MJ_PRIVATE = process.env.MJ_APIKEY_PRIVATE;
const MJ_LIST_ID = process.env.MJ_LIST_ID; // Contact List ID for Lead User Panel

if (!MJ_PUBLIC || !MJ_PRIVATE) {
  console.error('❌ Bitte MJ_APIKEY_PUBLIC und MJ_APIKEY_PRIVATE als Umgebungsvariablen setzen.');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString('base64');

// ─── Helper: Mailjet Request ───
async function mjRequest(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'Authorization': AUTH,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${MJ_API}${endpoint}`, opts);
  const data = await res.json();

  if (!res.ok) {
    const msg = data.ErrorMessage || data.StatusCode || 'Mailjet API Error';
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}

// ─── Contact Properties Definition ───
// Diese Properties müssen einmalig in Mailjet angelegt werden.
// Das Script macht das automatisch beim ersten Start.
const CONTACT_PROPERTIES = [
  { Name: 'firstname',          DataType: 'str',  NameSpace: 'static' },
  { Name: 'lastname',           DataType: 'str',  NameSpace: 'static' },
  { Name: 'age_group',          DataType: 'str',  NameSpace: 'static' },
  { Name: 'gender',             DataType: 'str',  NameSpace: 'static' },
  { Name: 'location',           DataType: 'str',  NameSpace: 'static' },
  { Name: 'profession',         DataType: 'str',  NameSpace: 'static' },
  { Name: 'referral_source',    DataType: 'str',  NameSpace: 'static' },
  { Name: 'uses_safenow',       DataType: 'str',  NameSpace: 'static' },
  { Name: 'safenow_since',      DataType: 'str',  NameSpace: 'static' },
  { Name: 'safenow_frequency',  DataType: 'str',  NameSpace: 'static' },
  { Name: 'device',             DataType: 'str',  NameSpace: 'static' },
  { Name: 'features_used',      DataType: 'str',  NameSpace: 'static' },
  { Name: 'life_situation',     DataType: 'str',  NameSpace: 'static' },
  { Name: 'safety_feeling',     DataType: 'str',  NameSpace: 'static' },
  { Name: 'safety_situations',  DataType: 'str',  NameSpace: 'static' },
  { Name: 'methods',            DataType: 'str',  NameSpace: 'static' },
  { Name: 'time_commitment',    DataType: 'str',  NameSpace: 'static' },
  { Name: 'language',           DataType: 'str',  NameSpace: 'static' },
  { Name: 'notes',              DataType: 'str',  NameSpace: 'static' },
];

async function ensureContactProperties() {
  console.log('🔧 Prüfe Contact Properties in Mailjet...');

  // Get existing properties
  let existing = [];
  try {
    const res = await mjRequest('/contactmetadata?Limit=200');
    existing = (res.Data || []).map(p => p.Name.toLowerCase());
  } catch (e) {
    console.log('  ⚠️  Konnte bestehende Properties nicht laden:', e.message);
  }

  // Create missing ones
  for (const prop of CONTACT_PROPERTIES) {
    if (existing.includes(prop.Name.toLowerCase())) {
      console.log(`  ✓ ${prop.Name} existiert bereits`);
      continue;
    }
    try {
      await mjRequest('/contactmetadata', 'POST', prop);
      console.log(`  ✓ ${prop.Name} angelegt`);
    } catch (e) {
      if (e.message && e.message.includes('already exists')) {
        console.log(`  ✓ ${prop.Name} existiert bereits`);
      } else {
        console.log(`  ✗ ${prop.Name}: ${e.message}`);
      }
    }
  }

  console.log('✅ Contact Properties bereit.\n');
}

// ═══════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════

/**
 * POST /api/register
 * Registriert einen neuen Lead User
 */
app.post('/api/register', async (req, res) => {
  try {
    const data = req.body;

    if (!data.email || !data.firstname || !data.lastname) {
      return res.status(400).json({ message: 'E-Mail, Vorname und Nachname sind Pflichtfelder.' });
    }

    // Build Mailjet properties object
    const properties = {};
    for (const prop of CONTACT_PROPERTIES) {
      if (data[prop.Name] !== undefined && data[prop.Name] !== '') {
        properties[prop.Name] = data[prop.Name];
      }
    }

    // Create/update contact with properties and add to list
    const payload = {
      Contacts: [
        {
          Email: data.email,
          Name: `${data.firstname} ${data.lastname}`,
          Properties: properties,
        }
      ],
    };

    // Add to contact list if configured
    if (MJ_LIST_ID) {
      payload.ContactsLists = [
        {
          ListID: parseInt(MJ_LIST_ID),
          Action: 'addnoforce',
        }
      ];
    }

    const result = await mjRequest('/contact/managemanycontacts', 'POST', payload);

    // Get the contact ID
    let contactId = null;
    try {
      const contact = await mjRequest(`/contact/${encodeURIComponent(data.email)}`);
      contactId = contact.Data[0]?.ID;
    } catch (e) {
      // Non-critical
    }

    res.json({
      success: true,
      contactId,
      message: 'Erfolgreich registriert!',
    });

  } catch (err) {
    console.error('Register error:', err.message);
    res.status(err.status || 500).json({
      message: err.message || 'Registrierung fehlgeschlagen.',
    });
  }
});

/**
 * GET /api/profile?email=...
 * Ruft das Profil eines Lead Users ab
 */
app.get('/api/profile', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ message: 'E-Mail ist erforderlich.' });
    }

    // Get contact
    const contact = await mjRequest(`/contact/${encodeURIComponent(email)}`);
    if (!contact.Data || contact.Data.length === 0) {
      return res.status(404).json({ message: 'Kein Profil gefunden.' });
    }

    const contactData = contact.Data[0];

    // Get contact properties
    const contactProps = await mjRequest(`/contactdata/${encodeURIComponent(email)}`);
    const properties = {};
    if (contactProps.Data && contactProps.Data[0] && contactProps.Data[0].Data) {
      for (const prop of contactProps.Data[0].Data) {
        if (prop.Value !== '' && prop.Value !== null) {
          properties[prop.Name.toLowerCase()] = prop.Value;
        }
      }
    }

    // Extract name parts from the Name field if properties don't have them
    if (!properties.firstname && contactData.Name) {
      const parts = contactData.Name.split(' ');
      properties.firstname = parts[0] || '';
      properties.lastname = parts.slice(1).join(' ') || '';
    }

    properties.email = contactData.Email;
    properties.id = contactData.ID;

    res.json(properties);

  } catch (err) {
    if (err.status === 404 || (err.message && err.message.includes('not found'))) {
      return res.status(404).json({ message: 'Kein Profil mit dieser E-Mail gefunden.' });
    }
    console.error('Profile error:', err.message);
    res.status(err.status || 500).json({
      message: err.message || 'Profil konnte nicht geladen werden.',
    });
  }
});

/**
 * PUT /api/profile
 * Aktualisiert das Profil eines Lead Users
 */
app.put('/api/profile', async (req, res) => {
  try {
    const data = req.body;
    if (!data.email) {
      return res.status(400).json({ message: 'E-Mail ist erforderlich.' });
    }

    // Build properties update
    const propData = [];
    for (const prop of CONTACT_PROPERTIES) {
      if (data[prop.Name] !== undefined) {
        propData.push({ Name: prop.Name, Value: data[prop.Name] });
      }
    }

    await mjRequest(`/contactdata/${encodeURIComponent(data.email)}`, 'PUT', {
      Data: propData,
    });

    // Update name if changed
    if (data.firstname || data.lastname) {
      try {
        const name = `${data.firstname || ''} ${data.lastname || ''}`.trim();
        await mjRequest(`/contact/${encodeURIComponent(data.email)}`, 'PUT', {
          Name: name,
        });
      } catch (e) {
        // Non-critical
      }
    }

    res.json({ success: true, message: 'Profil aktualisiert.' });

  } catch (err) {
    console.error('Update error:', err.message);
    res.status(err.status || 500).json({
      message: err.message || 'Aktualisierung fehlgeschlagen.',
    });
  }
});

/**
 * DELETE /api/profile?email=...
 * Löscht einen Lead User (DSGVO-konform)
 */
app.delete('/api/profile', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ message: 'E-Mail ist erforderlich.' });
    }

    // Remove from list
    if (MJ_LIST_ID) {
      try {
        const contact = await mjRequest(`/contact/${encodeURIComponent(email)}`);
        const contactId = contact.Data[0]?.ID;
        if (contactId) {
          await mjRequest(`/contact/${contactId}/managecontactslists`, 'POST', {
            ContactsLists: [{ ListID: parseInt(MJ_LIST_ID), Action: 'remove' }],
          });
        }
      } catch (e) {
        // Continue with deletion even if list removal fails
      }
    }

    // Clear all properties (Mailjet doesn't truly delete contacts,
    // but we can clear all data for DSGVO compliance)
    const emptyData = CONTACT_PROPERTIES.map(p => ({ Name: p.Name, Value: '' }));
    await mjRequest(`/contactdata/${encodeURIComponent(email)}`, 'PUT', {
      Data: emptyData,
    });

    // Unsubscribe the contact
    try {
      await mjRequest(`/contact/${encodeURIComponent(email)}`, 'PUT', {
        IsExcludedFromCampaigns: true,
        Name: 'DELETED',
      });
    } catch (e) {
      // Non-critical
    }

    res.json({ success: true, message: 'Daten gelöscht.' });

  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(err.status || 500).json({
      message: err.message || 'Löschen fehlgeschlagen.',
    });
  }
});

// ═══════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n🛡️  SafeNow Lead User Panel`);
  console.log(`   Server läuft auf http://localhost:${PORT}`);
  console.log(`   Mailjet API Key: ${MJ_PUBLIC.substring(0, 8)}...`);
  if (MJ_LIST_ID) {
    console.log(`   Contact List ID: ${MJ_LIST_ID}`);
  } else {
    console.log(`   ⚠️  Kein MJ_LIST_ID gesetzt — Kontakte werden ohne Liste angelegt.`);
  }
  console.log('');

  // Setup contact properties on first run
  await ensureContactProperties();

  console.log(`🚀 Bereit! Öffne http://localhost:${PORT}\n`);
});

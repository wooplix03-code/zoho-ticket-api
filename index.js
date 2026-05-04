console.log("Server starting...");
const express = require("express");
const axios = require("axios");
require("dotenv").config();
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// retry helper
async function retry(fn, retries = 3) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    return retry(fn, retries - 1);
  }
}

app.post("/api/create-ticket", async (req, res) => {
  try {
    const { subject, description, email, name } = req.body;

    if (!subject || !description || !email) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    // token
    const tokenRes = await retry(() =>
      axios.post("https://accounts.zoho.in/oauth/v2/token", null, {
        params: {
          refresh_token: process.env.ZOHO_REFRESH_TOKEN,
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
          grant_type: "refresh_token"
        }
      })
    );

    const token = tokenRes.data.access_token;

    // create contact
    const contact = await axios.post(
      "https://desk.zoho.in/api/v1/contacts",
      {
        email,
        lastName: name || "User"
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: process.env.ZOHO_ORG_ID
        }
      }
    );

    // create ticket
    const ticket = await axios.post(
      "https://desk.zoho.in/api/v1/tickets",
      {
        subject,
        description,
        departmentId: process.env.ZOHO_DEPARTMENT_ID,
        contactId: contact.data.id,
        priority: "High",
        status: "Open",
        channel: "Web"
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: process.env.ZOHO_ORG_ID
        }
      }
    );

    res.json({
      success: true,
      ticketId: ticket.data.id
    });

  } catch (err) {
    console.log(err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: "Failed"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
console.log("Server starting...");

const express = require("express");
const axios = require("axios");
require("dotenv").config();
const cors = require("cors");
const FormData = require("form-data");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

// ✅ Health check
app.get("/", (req, res) => {
  res.send("Zoho Ticket API is running 🚀");
});

const PORT = process.env.PORT || 3000;

// 🔁 Retry helper
async function retry(fn, retries = 3) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    return retry(fn, retries - 1);
  }
}

// 🎫 CREATE TICKET
app.post("/api/create-ticket", async (req, res) => {
  try {
    const {
      subject,
      description,
      email,
      name,

      wallet_address,
      wallet_provider,
      discord_username,
      browser,
      device,
      output_token_mint,
      transaction_signature,
      actual_result,
      expected_result,
      network,

      file_name,
      file_data
    } = req.body;

    console.log("REQ BODY:", req.body);

    // ✅ validation
    if (!subject || !description || !email) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    // 🔐 TOKEN
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

    // 👤 CONTACT CREATE
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

    // 🧠 CLEAN CUSTOM FIELDS
    const customFields = {
      cf_wallet_address: wallet_address,
      cf_wallet_provider: wallet_provider,
      cf_discord_x_username: discord_username,
      cf_browser: browser,
      cf_device: device,
      cf_output_token_mint: output_token_mint,
      cf_transaction_signature: transaction_signature,
      cf_actual_result: actual_result,
      cf_expected_result: expected_result,
      cf_network: network
    };

    Object.keys(customFields).forEach((key) => {
      if (!customFields[key]) delete customFields[key];
    });

    console.log("FINAL CUSTOM FIELDS:", customFields);

    // 🎫 CREATE TICKET (🔥 layoutId FIX)
    const ticket = await axios.post(
      "https://desk.zoho.in/api/v1/tickets",
      {
        subject,
        description,
        departmentId: process.env.ZOHO_DEPARTMENT_ID,
        contactId: contact.data.id,

        // 🔥 CRITICAL FIX
        layoutId: process.env.ZOHO_LAYOUT_ID,

        priority: "High",
        status: "Open",
        channel: "Web",

        customFields: customFields
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: process.env.ZOHO_ORG_ID
        }
      }
    );

    // 📎 ATTACHMENT
    if (file_data) {
      try {
        const buffer = Buffer.from(file_data, "base64");

        const formData = new FormData();
        formData.append("file", buffer, file_name || "file.png");

        await axios.post(
          `https://desk.zoho.in/api/v1/tickets/${ticket.data.id}/attachments`,
          formData,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              orgId: process.env.ZOHO_ORG_ID,
              ...formData.getHeaders()
            }
          }
        );

        console.log("Attachment uploaded ✅");
      } catch (err) {
        console.log("Attachment Error:", err.response?.data || err.message);
      }
    }

    // ✅ RESPONSE
    res.json({
      success: true,
      ticketId: ticket.data.id
    });

  } catch (err) {
    console.log("CREATE ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: err.response?.data || "Failed to create ticket"
    });
  }
});

// 🔍 GET TICKET
app.get("/api/get-ticket/:id", async (req, res) => {
  try {
    const ticketId = req.params.id;

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

    const ticket = await retry(() =>
      axios.get(`https://desk.zoho.in/api/v1/tickets/${ticketId}`, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: process.env.ZOHO_ORG_ID
        }
      })
    );

    res.json({
      success: true,
      data: ticket.data
    });

  } catch (err) {
    console.log("GET ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: err.response?.data || "Failed to fetch ticket"
    });
  }
});

// 🚀 START SERVER
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

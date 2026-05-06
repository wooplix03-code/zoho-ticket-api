console.log("Server starting...");

const express = require("express");
const axios = require("axios");
require("dotenv").config();
const cors = require("cors");
const FormData = require("form-data");
const multer = require("multer");
const fs = require("fs");

// 📂 multer setup
const upload = multer({ dest: "uploads/" });

const app = express();
app.use(express.json());
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
app.post("/api/create-ticket", upload.single("file"), async (req, res) => {
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
      request_type,
      issue_category,
      device,
      operating_system,
      input_token_mint,
      output_token_mint,
      transaction_signature,
      actual_result,
      expected_result,
      network
    } = req.body;

    console.log("REQ BODY:", req.body);

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

    // 👤 CONTACT
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

    // 🧠 CUSTOM FIELDS
    const cf = {
      cf_wallet_address: wallet_address,
      cf_wallet_provider: wallet_provider,
      cf_discord_x_username: discord_username,
      cf_browser: browser,
      cf_device: device,
      cf_input_token_mint: input_token_mint,
      cf_output_token_mint: output_token_mint,
      cf_transaction_signature: transaction_signature,
      cf_actual_result: actual_result,
      cf_expected_result: expected_result,
      cf_operating_system: operating_system,
      cf_request_type: request_type,
      cf_issue_category: issue_category,
      cf_network: network
    };

    // remove empty fields
    Object.keys(cf).forEach((key) => {
      if (!cf[key]) delete cf[key];
    });

    console.log("FINAL CF:", cf);

    // 🎫 CREATE TICKET
    const ticket = await axios.post(
      "https://desk.zoho.in/api/v1/tickets",
      {
        subject,
        description,
        departmentId: process.env.ZOHO_DEPARTMENT_ID,
        contactId: contact.data.id,
        priority: "High",
        status: "Open",
        channel: "Web",
        cf: cf
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: process.env.ZOHO_ORG_ID
        }
      }
    );

    // 📎 FILE ATTACHMENT (FIXED VERSION)
    if (req.file) {
      try {
        const formData = new FormData();

        formData.append("file", fs.createReadStream(req.file.path), {
          filename: req.file.originalname,      // ✅ FIX 1
          contentType: req.file.mimetype        // ✅ FIX 2 (corruption fix)
        });

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

        // delete temp file
        fs.unlinkSync(req.file.path);

      } catch (err) {
        console.log("Attachment Error:", err.response?.data || err.message);
      }
    }

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

// ✏️ UPDATE TICKET (with file)
app.patch("/api/update-ticket/:id", upload.single("file"), async (req, res) => {
  try {
    const ticketId = req.params.id;

    const {
      subject,
      description,
      status,
      priority,

      wallet_address,
      wallet_provider,
      discord_username,
      browser,
      device,
      input_token_mint,
      output_token_mint,
      transaction_signature,
      actual_result,
      expected_result,
      network,
      request_type,
      issue_category
    } = req.body;

    console.log("UPDATE BODY:", req.body);

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

    // 🧠 CUSTOM FIELDS
    const cf = {
      cf_wallet_address: wallet_address,
      cf_wallet_provider: wallet_provider,
      cf_discord_x_username: discord_username,
      cf_browser: browser,
      cf_device: device,
      cf_input_token_mint: input_token_mint,
      cf_output_token_mint: output_token_mint,
      cf_transaction_signature: transaction_signature,
      cf_actual_result: actual_result,
      cf_expected_result: expected_result,
      cf_request_type: request_type,
      cf_issue_category: issue_category,
      cf_network: network
    };

    // remove empty
    Object.keys(cf).forEach((key) => {
      if (!cf[key]) delete cf[key];
    });

    // ✏️ UPDATE TICKET
    const response = await axios.patch(
      `https://desk.zoho.in/api/v1/tickets/${ticketId}`,
      {
        subject,
        description,
        status,
        priority,
        cf: cf
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          orgId: process.env.ZOHO_ORG_ID
        }
      }
    );

    // 📎 FILE ATTACHMENT (if provided)
    if (req.file) {
      try {
        const formData = new FormData();

        formData.append("file", fs.createReadStream(req.file.path), {
          filename: req.file.originalname,
          contentType: req.file.mimetype
        });

        await axios.post(
          `https://desk.zoho.in/api/v1/tickets/${ticketId}/attachments`,
          formData,
          {
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              orgId: process.env.ZOHO_ORG_ID,
              ...formData.getHeaders()
            }
          }
        );

        fs.unlinkSync(req.file.path);
        console.log("Update attachment uploaded ✅");

      } catch (err) {
        console.log("Update Attachment Error:", err.response?.data || err.message);
      }
    }

    res.json({
      success: true,
      data: response.data
    });

  } catch (err) {
    console.log("UPDATE ERROR:", err.response?.data || err.message);

    res.status(500).json({
      success: false,
      error: err.response?.data || "Failed to update ticket"
    });
  }
});

// 🚀 START
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});

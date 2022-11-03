const axios = require("axios");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const crypto = require("crypto");
var _ = require("lodash");
const url = require("url");
require("dotenv").config();
//working port
const app = express();
let authVerified = false;
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.listen(process.env.PORT || 5000, () => "it started");

async function idGenerator() {
  const url = "https://demo-api.gii.cloud/api/oauth/sign";
  const responseUrl = await axios.post(
    url,
    {
      visible_text:
        "Welcome to EUCaps. Please provide your password to continue verification process",
    },
    {
      auth: {
        username: process.env.DEVCODE_USERNAME,
        password: process.env.DEVCODE_SECRET,
      },
    }
  );
  return responseUrl.data.id;
}

async function hmacGenerator() {
  const secret = process.env.DEVCODE_SECRET;
  const hash = crypto
    .createHmac("sha256", secret)
    // .update("GeeksforGeeks")
    .digest("hex");

  return hash;
}

const generateAccessToken = async (code) => {
  const baseUrl = "https://demo-api.gii.cloud/api/oauth/token";
  const params = new url.URLSearchParams({
    grant_type: "authorization_code",
    code: code,
    redirect_uri: "http://localhost:5000/auth",
  });
  const data = params.toString();
  try {
    const responseUrl = await axios({
      method: "post",
      url: baseUrl,
      data,
      auth: {
        username: process.env.DEVCODE_USERNAME,
        password: process.env.DEVCODE_SECRET,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
    });
    return responseUrl.data.access_token;
  } catch (err) {
    return err;
  }
};

const getUserProfile = async (access_token) => {
  try {
    const res = await axios({
      method: "post",
      url: "https://demo-api.gii.cloud/api/oauth/userinfo",
      data: {
        scopes: "profile",
      },
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    return res.data;
  } catch (err) {
    return err;
  }
};

const formatKYCData = async (blob_data) => {
  const formatted_data = {
    FullName: blob_data.name,
    NationalIDNumber: blob_data.ssn,
    nationalIdType: blob_data.ssn_type,
  };

  let removedAttributes = _.omit(blob_data, ["name", "ssn", "ssn_type"]);
  const merged_data = { ...removedAttributes, ...formatted_data };
  return merged_data;
};

function pad(d) {
  return d < 10 ? "0" + d.toString() : d.toString();
}

// const formatTruliooData = async (trulioo_res) => {
//   const formatted_data = {
//     nationalIdType: "NationalIdNumber",
//     country: trulioo_res.CountryCode,
//     birthdate: `${trulioo_res.YearOfBirth}-${pad(
//       trulioo_res.MonthOfBirth
//     )}-${pad(trulioo_res.DayOfBirth)}`,
//     address: {
//       street_address: trulioo_res.Address1,
//       postal_code: trulioo_res.PostalCode,
//       country: trulioo_res.CountryCode,
//     },
//   };
//   let removedAttributes = _.omit(trulioo_res, [
//     "Address1",
//     "CountryCode",
//     "YearOfBirth",
//     "MonthOfBirth",
//     "DayOfBirth",
//   ]);
//   const merged_data = { ...removedAttributes, ...formatted_data };
//   console.log("formatted data", merged_data);
//   return merged_data;
// };

app.get("/idhash", async (req, res) => {
  try {
    const id = await idGenerator();
    const getHash = await hmacGenerator();

    res.status(200).json({
      id,
      hash: getHash,
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// app.get("/", async (req, res) => {
//   const id = await idGenerator();
//   const getHash = await hmacGenerator();
//   const authUrl =
//     "https://demo-api.gii.cloud/api/oauth/auth" +
//     "?client_id=eucaps_test" + // your-client is the client ID provided by DID
//     "&redirect_uri=" +
//     encodeURIComponent("http://localhost:5000/auth") +
//     "&response_type=code" +
//     "&scope=openid" +
//     `&sign_id=${id}` + // ID retrieved from post above
//     `&state=${getHash}` + // generate state on your side, using e.g. a HMAC
//     "&identity_provider=bankid-se" +
//     "&display=popup";

//   // res.redirect(authUrl);
//   const htmlIframe = `<iframe style="height: 500px; width: 500px" src=${authUrl}></iframe>`;
//   const htmlBroilerPlate = `
//                             <!DOCTYPE html>
//                             <html lang="en">
//                               <head>
//                                 <meta charset="UTF-8" />
//                                 <meta http-equiv="X-UA-Compatible" content="IE=edge" />
//                                 <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//                                 <title>Document</title>
//                               </head>
//                               <body style="background-color:black; color:white;">
//                                 <h3>DevCode Identity</h3>
//                                 ${htmlIframe}
//                               </body>
//                             </html>
// `;
//   res.send(htmlBroilerPlate);
// });

app.get("/auth", async (req, res) => {
  try {
    const { code } = req.query;
    const access_token = await generateAccessToken(code);
    const user_info = await getUserProfile(access_token);
    //WRITE INTO DYNAMODB IN HERE
    const formatted_data = await formatKYCData(user_info);
    console.log("data has been formatted", formatted_data);
    //NOTIFY FRONTEND IN HERE
    authVerified = true;
    res
      .status(200)
      .json("Authetication completed successfully. Redirecting in few seconds");
  } catch (err) {
    res.status(500).json(err);
  }
});

app.get("/authres", function (req, res) {
  try {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",

      // enabling CORS
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "Origin, X-Requested-With, Content-Type, Accept",
    });

    const intervalId = setInterval(() => {
      if (authVerified === true) {
        res.write(`data: ${JSON.stringify("auth successful")}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify("waiting for auth")}\n\n`);
      }
    }, 1000);

    res.on("close", () => {
      console.log("Client closed connection");
      clearInterval(intervalId);
      authVerified = false;
      res.end();
    });
  } catch (err) {
    res.end();
  }
});

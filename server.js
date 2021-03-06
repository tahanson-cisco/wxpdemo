// server.js
// where your node app starts
require('dotenv').config();
// init project
const base64url = require('base64url');
const express = require("express");
const bodyParser = require("body-parser");
const RedisExpiredEvents = require("./redis-expired-events");
const expiry = require("./expiry");
const app = express();
const thismoment = require("moment");
const url = require("url");
const randomize = require("randomatic");
const session = require("express-session");
const RedisRepo = require("./redis-repo");
const rr = new RedisRepo();
const tokgen = require("./token-generator");
const email_validator = require("email-validator");
const request = require("request");
var secured = require('./lib/middleware/secured');
//sentry.io
const Sentry = require("@sentry/node");
Sentry.init({
  dsn:
    "https://f453e51294d34cdb9a2962000f5612e3@o450029.ingest.sentry.io/5434024"
});

// config express-session
var sess = {
  secret: "CHANGE THIS TO A RANDOM SECRET",
  cookie: {},
  resave: false,
  saveUninitialized: true
};

if (app.get("env") === "production") {
  // Use secure cookies in production (requires SSL/TLS)
  sess.cookie.secure = true;
  // Uncomment the line below if your application is behind a proxy (like on Heroku)
  // or if you're encountering the error message:
  // "Unable to verify authorization request state"
  app.set("trust proxy", 1);
}

app.use(session(sess));

// Load Passport
const passport = require("passport");
const Auth0Strategy = require("passport-auth0");

// Configure Passport to use Auth0
var strategy = new Auth0Strategy(
  {
    domain: process.env.AUTH0_DOMAIN,
    clientID: process.env.AUTH0_CLIENT_ID,
    clientSecret: process.env.AUTH0_CLIENT_SECRET,
    callbackURL:
      process.env.AUTH0_CALLBACK_URL || "http://localhost:3000/callback"
  },
  function(accessToken, refreshToken, extraParams, profile, done) {
    // accessToken is the token to call Auth0 API (not needed in the most cases)
    // extraParams.id_token has the JSON Web Token
    // profile has all the information from the user
    return done(null, profile);
  }
);

passport.use(strategy);

app.use(passport.initialize());
app.use(passport.session());
// You can use this section to keep a smaller payload
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(user, done) {
  done(null, user);
});

app.engine('pug', require('pug').__express)
app.set("view engine", "pug");

var authRouter = require("./routes/auth");
var indexRouter = require("./routes/index");

// ..
app.use("/", authRouter);
app.use("/", indexRouter);

// ..
app.use(express.static("public"));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// parse application/json
app.use(bodyParser.json());

app.get('/linkgen', function (req, res, next) {
  if(req.session.userToken){
    res.render('linkgen', {});
  } else {
    res.redirect(`${process.env.WEBEX_AUTH_URL}&state=linkgen`);
  }
});

let paths = {"guest":"guest", "widget":"widget", "guestsdk":"sdk"}
function renderFunc(req, res) {
  rr.get(`URL:${req.params.guest_session_id}`).then(result => {
    if (result == 1) {
      rr.get(req.params.guest_session_id).then(result => {
        parts = req.originalUrl.split("/");
        console.log(parts);
        res.cookie("type", parts[1]);
        res.cookie("token", tokgen(JSON.parse(result).display_name).token);
        res.cookie("target", JSON.parse(result).sip_target);
        res.cookie("label", JSON.parse(result).display_name);
        res.sendFile(__dirname + `/views/${paths[parts[1]]}.html`);
      });
    } else {
      res.send({ message: `this link has expired` });
    }
  });
}

app.get("/widget/:guest_session_id", secured(), renderFunc);
app.get("/guestsdk/:guest_session_id", secured(), renderFunc);
app.get("/guest/:guest_session_id", secured(), renderFunc);


app.get("/create_token", function(req, res) {
  request.post({
      url: 'https://webexapis.com/access_token',
      form: {
        grant_type: 'authorization_code',
        client_id: process.env.WEBEX_AUTH_CLIENT,
        client_secret: process.env.WEBEX_AUTH_SECRET,
        code: req.query.code,
        redirect_uri: `https://${req.get("host")}${req.route.path}`
      }
    },function(error, resp, body) {
        if (!error && resp.statusCode === 200) {
          jbody = JSON.parse(body);
          console.log(req.query.state);
          req.session.userToken = jbody.access_token;
          if(req.query.state == "linkgen"){
            res.redirect(`/linkgen`);
          } else {
            res.redirect(`/employee/${req.query.state}`);
          }
        } else {
          res.json(error);
        }
      }
    );
});


app.get("/employee/:guest_session_id", function(req, res) {
  rr.get(`URL:${req.params.guest_session_id}`).then(result => {
    if (result == 1) {
      rr.get(req.params.guest_session_id).then(result => {
        if(req.session.userToken){
          request.get({
              url: 'https://webexapis.com/people/me',
              headers: { 'Authorization': `Bearer ${req.session.userToken}` }
            },function(error, resp, body) {
              console.log(body);
                if (!error && resp.statusCode === 200) {
                  jbody = JSON.parse(body);
                  res.cookie("type", "employee");
                  res.cookie("token", req.session.userToken);
                  res.cookie("target", JSON.parse(result).sip_target);
                  res.cookie("label", jbody.displayName);
                  res.sendFile(__dirname + "/views/guest.html");
                } else {
                  res.json(error);
                }
              }
            );
        } else {
          res.redirect(`${process.env.WEBEX_AUTH_URL}&state=${req.params.guest_session_id}`);
        }
      });
    } else {
      res.send({ message: `this link has expired` });
    }
  });
});


function isRoomId(myTarget){
  let result = base64url.decode(myTarget);
  return result.indexOf('ciscospark://us/ROOM/') >= 0;
}


app.post("/create_url", function(req, res) {
  if (req.body.expiry_date) {
    if(email_validator.validate(req.body.sip_target) || isRoomId(req.body.sip_target)){
      console.log(thismoment(req.body.expiry_date).utcOffset(req.body.offset));
      let endmoment = thismoment(req.body.expiry_date).utcOffset(
        req.body.offset
      );

      let Urlexpiry = Math.round(
        expiry.calculateSeconds(
          thismoment().utcOffset(req.body.offset, true),
          req.body.expiry_date
        )
      );
      let urlPaths = ["guest", "employee"];
      let respObjects = [];
      let rrPromises = [];
      for(let i in urlPaths){
        let guestSessionID = randomize("Aa0", 16);
        let guestUrl = `https://${req.get("host")}/${urlPaths[i]}/${guestSessionID}`;
        req.body.url = guestUrl;
        req.body.display_name = urlPaths[i].charAt(0).toUpperCase() + urlPaths[i].slice(1);
        let rrPromise = rr.setURL(guestSessionID, JSON.stringify(req.body), Urlexpiry)
          .then(() => {
            respObjects.push(guestUrl);
          })
          .catch(function(err) {
            console.log(err.message);
          });
        rrPromises.push(rrPromise);
      }
      Promise.all(rrPromises).then(results => {
        console.log(respObjects);
        res.send({
          result: "OK",
          message: "Session Created",
          urls: respObjects,
          expires: `in ${thismoment.duration(Urlexpiry, "seconds").humanize()}`
        });
      })
    } else {
      res.send({
        result: "Error",
        message: "Invalid SIP URI or RoomId!"
      });
    }
  } else {
    res.send({
      result: "Error",
      message: "Invalid Expiry Date provided!"
    });
  }
});

// listen for requests :)
const listener = app.listen(process.env.PORT, function() {
  console.log("Your app is listening on port " + listener.address().port);
});

RedisExpiredEvents();
//YYYYMMDD
//console.log(expiry.calculateDays(thismoment(),'20190714'));
//console.log(expiry.calculateSeconds(thismoment(),'20200714'));

//rr.setURL('98r34982r', '325325', 500);
//console.log(tokgen("Harish Chawla").token);

//console.log(thismoment());
//console.log(thismoment('2019-07-16 00:54').utcOffset(240));

//send_email('zoneix@gmail.com', 'admin@bigbrainpan.com', 'this is a test', 'here\'s the body');
//send_email('harishchawla@hotmail.com','this is some body');
//console.log((send_email).toString());

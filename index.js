//jshint esversion:6
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const _ = require("lodash");

const app = express();

app.use(express.static("public"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({
  extended:true
}));

// setting up session
app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false
}));

//initialize passport and set passport to manage our session
app.use(passport.initialize());
app.use(passport.session());

//Connect to database
mongoose.connect(process.env.ATLAS_URI,{useNewUrlParser:true});
mongoose.set("useCreateIndex", true);


// Schemas
const taskSchema = {
  name: String,
  completed: Boolean
};

const listSchema = {
  name: String,
  tasks: [taskSchema]
};

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  name: String,
  taskLists: [listSchema]
});

//make user schema use mongoose passport plugin and set unique username to email
userSchema.plugin(passportLocalMongoose);
//make user schema use findOrCreate plugin
userSchema.plugin(findOrCreate);

// Models
const User = new mongoose.model("User", userSchema);
const Task = mongoose.model("task", taskSchema);
const List = mongoose.model("list", listSchema);

// create local login strategy
passport.use(User.createStrategy());

//works with any authentication
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

//GOOGLE AUTH
passport.use(new GoogleStrategy({
    clientID:     process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/tasks",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ username: "googleID:" + profile.id }, function (err, user) {
      user.name = profile.displayName;
      user.save();
      return cb(err, user);
    });
  }
));

//Default Tasks
const task1 = new Task({
  name: "Greetings, Friend",
  completed: false
});

const task2 = new Task({
  name: "Hope you have a productive day",
  completed: false
});

const task3 = new Task({
  name: "Good Luck!",
  completed: false
});

const defaultTasks = [task1, task2, task3];

// GET _______________________________________________________________________

  // Authentication
  app.get('/auth/google',
  passport.authenticate('google', { scope: ["profile"]}
));

app.get( '/auth/google/tasks',
    passport.authenticate( 'google', {
        successRedirect: '/lists',
        failureRedirect: '/login'
})
);

app.get("/login", function(req, res) {
  const msg = req.query.error
  console.log(msg);
  res.render("login", {errorMsg: msg});
});

app.get("/register", function(req, res) {
  res.render("register");
});

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/login");
});

app.get("/", function(req, res) {

  if(req.isAuthenticated()) {
    res.redirect("/today");

} else {
  res.redirect("/login");
}
});

app.get("/lists", function(req, res) {

    if(req.isAuthenticated()) {
      User.findById(req.user.id, function(err, foundUser){
        if (err){
          console.log(err);
        } else {
          if(foundUser){

            res.render("listCollection", {allLists: foundUser.taskLists, dropDown: foundUser.name});
          }
        }
      });
    } else {
      res.redirect("/login");
    }

});

// Dynamic route!
app.get("/:customListName", function (req, res){
  if(req.isAuthenticated()) {


    const customListName = _.capitalize(req.params.customListName).trim();

    User.findOne({_id: req.user.id}).select({ taskLists: {$elemMatch: {name: customListName}}}).exec(function (err, doc){
      if(doc.taskLists[0])
      {
        User.findById(req.user.id, function(err, foundUser){
          if (err) {
            console.log(err);
          } else {
              if(foundUser) {
                //Find index of specific object using findIndex method.
                let objIndex = foundUser.taskLists.findIndex((obj => obj.name === customListName));
                res.render("list", {listTitle: foundUser.taskLists[objIndex].name, newListItems: foundUser.taskLists[objIndex].tasks, dropDown: foundUser.name});
      }
    }
    });

      } else {
        res.redirect("/lists")
      }

    })

  } else {
    res.redirect("/login");
  }

});

// POST_______________________________________________________________________

app.post("/register", function(req, res) {
  User.register({username: req.body.username}, req.body.password, function(err, user) {
    if(err){
      console.log(err);
      res.redirect("/register");
    } else {
      user.name = req.body.realName;
      user.save();
      passport.authenticate("local")(req, res, function(){
        res.redirect("/");
      });
    }
  });
});

app.post('/login', function(req, res, next) {
  const user = new User({
        username: req.body.username,
        password: req.body.password
      });

  passport.authenticate('local', function(err, user, info) {
    if (err) { return next(err); }
    if (!user) { return res.redirect('/login?error=User Not Found'); }
    req.logIn(user, function(err) {
      if (err) { return next(err); }
      return res.redirect('/');
    });

  })(req, res, next);
});

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/login");
});

app.post("/", function(req, res){

  if(req.isAuthenticated()) {
    const taskName = req.body.newItem;
    const listName = req.body.list;

    const newTask = new Task({
      name: taskName,
      completed: false
    });

    User.findById(req.user.id, function(err, foundUser){
      if (err) {
        console.log(err);
      } else {
          if(foundUser) {
            //Find index of specific object using findIndex method.
            let objIndex = foundUser.taskLists.findIndex((obj => obj.name === listName));
            foundUser.taskLists[objIndex].tasks.push(newTask);
            foundUser.save();
            res.redirect("/" + listName);

  }
}
});


  } else {
    res.redirect("/login");
  }

});

  app.post("/tasks", function(req, res){

    if(req.isAuthenticated()) {
      const checkedTaskId = req.body.itemID;
      const listName = req.body.listName;
      let stateString = (req.body.outcome === "true");
      let newState = !stateString;

      User.findById(req.user.id, function(err, foundUser){
        if (err) {
          console.log(err);
        } else {
            if(foundUser) {

              let listIndex = foundUser.taskLists.findIndex((obj => obj.name === listName));
              let taskIndex = foundUser.taskLists[listIndex].tasks.findIndex(obj => JSON.stringify(obj._id) === JSON.stringify(checkedTaskId));

              foundUser.taskLists[listIndex].tasks[taskIndex].completed = newState;
              foundUser.save();
              res.redirect("/" + listName);
    }
  }
  });
  } else {
    res.redirect("/login");
  }

  });

app.post("/delete", function(req, res){

  if(req.isAuthenticated()) {
    const checkedTaskId = req.body.deleteButton;
    const listName = req.body.listName;

    User.findById(req.user.id, function(err, foundUser){
      if (err) {
        console.log(err);
      } else {
          if(foundUser) {
            //Find index of specific object using findIndex method.
            let listIndex = foundUser.taskLists.findIndex((obj => obj.name === listName));
            foundUser.taskLists[listIndex].tasks = foundUser.taskLists[listIndex].tasks.filter(obj => JSON.stringify(obj._id) !== JSON.stringify(checkedTaskId));

            foundUser.save();
            res.redirect("/" + listName);
  }
}
});

  } else {
    res.redirect("/login");
  }

});

app.post("/deleteList", function(req, res){

  if(req.isAuthenticated()) {
    const listId = req.body.ListID;

      User.findOneAndUpdate({_id: req.user.id}, {$pull: {taskLists: {_id: listId}}}, function(err, foundList){
        if(!err){
          res.redirect("/lists");
        }
      });



  } else {
    res.redirect("/login");
  }

});

app.post("/lists", function(req, res) {

  if(req.isAuthenticated()) {

    const customListName = _.capitalize(req.body.newList.replace(/[^a-zA-Z0-9]/g, '')).trim();

    if(customListName){

          User.findOne({_id: req.user.id, "taskLists.name": customListName}, function(err, foundUser){
            if(!err){
              if(foundUser)
              {
                res.redirect("/" + customListName);
              }
              else {

                User.findById(req.user.id, function(err, foundUser){
                  if (err) {
                    console.log(err);
                  } else {
                      if(foundUser) {
                        const newList = new List({
                          name: customListName,
                          tasks: defaultTasks
                        });
                        foundUser.taskLists.push(newList)
                        foundUser.save(function(){
                          res.redirect("/" + customListName);
                });
              }
            }
          });
              }

            }
          });


    } else {
      res.redirect("/");
    }
  } else {
    res.redirect("/login");
  }
});



app.listen(process.env.PORT || 3000, function() {
  console.log("Server started on port 3000");
});

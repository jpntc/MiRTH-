// Required packages: Express, SQLite3

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

// Face Match Game Setup
function createFaceMatchApp() {
  const app = express();
  const PORT = 3001;

  // Database Setup
  const db = new sqlite3.Database("./alzheimer-helper.db", (err) => {
    if (err) {
      console.error("Error opening database:", err.message);
    } else {
      console.log("Connected to the SQLite database.");
    }
  });

  // Create Photos Table
  const createPhotosTableQuery = `
    CREATE TABLE IF NOT EXISTS Photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT,
      label TEXT,
      userId INTEGER
    );
  `;

  db.run(createPhotosTableQuery, (err) => {
    if (err) {
      console.error("Error creating Photos table:", err.message);
    }
  });

  // Middleware Setup
  app.use(express.urlencoded({ extended: true }));

  // Game Result Tracker Class
  class GameResultTracker {
    constructor() {
      this.totalQuestions = 0;
      this.correctAnswers = 0;
      this.skippedQuestions = [];
    }

    addQuestion(correct) {
      this.totalQuestions++;
      if (correct) {
        this.correctAnswers++;
      }
    }

    skipQuestion(question) {
      this.skippedQuestions.push(question);
    }

    getScorePercentage() {
      return ((this.correctAnswers / this.totalQuestions) * 100).toFixed(2);
    }
  }

  // Initialize game result tracker
  const gameResultTracker = new GameResultTracker();

  // Routes
  app.get("/game", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/signin");
    }

    db.all(`SELECT * FROM Photos WHERE userId = ?`, [req.user.id], (err, photos) => {
      if (err) {
        return res.send("Error retrieving photos: " + err.message);
      }

      if (photos.length < 4) {
        return res.send("Please upload at least 4 photos to start the game.");
      }

      let currentPhoto;
      if (gameResultTracker.skippedQuestions.length > 0) {
        currentPhoto = gameResultTracker.skippedQuestions.shift();
      } else {
        const randomIndex = Math.floor(Math.random() * photos.length);
        currentPhoto = photos[randomIndex];
      }

      const shuffledPhotos = photos.sort(() => 0.5 - Math.random()).slice(0, 4);

      let gameHtml = `<p>Who is ${currentPhoto.label}?</p>`;
      shuffledPhotos.forEach((photo) => {
        gameHtml += `<img src="${photo.url}" width="100"><form action="/check" method="post"><input type="hidden" name="guess" value="${photo.id}"><button type="submit">Select</button></form>`;
      });
      gameHtml += `<form action="/skip" method="post"><button type="submit">Skip</button></form>`;

      req.session.correctLabel = currentPhoto.label;
      req.session.currentPhoto = currentPhoto;
      res.send(gameHtml);
    });
  });

  app.post("/check", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/signin");
    }

    const { guess } = req.body;
    db.get(`SELECT * FROM Photos WHERE id = ?`, [guess], (err, photo) => {
      if (err) {
        return res.send("Error retrieving photo: " + err.message);
      }

      if (!photo) {
        return res.send('Photo not found. <a href="/game">Try again</a>');
      }

      if (photo.label === req.session.correctLabel) {
        gameResultTracker.addQuestion(true);
      } else {
        gameResultTracker.addQuestion(false);
      }

      if (
        gameResultTracker.totalQuestions >= 4 &&
        gameResultTracker.skippedQuestions.length === 0
      ) {
        if (gameResultTracker.getScorePercentage() < 50) {
          const sendEmail = require("./send_email");
          sendEmail(
            "familyEmail",
            "Alert: Low Score in Face Match Game",
            "The user scored below 50% in the face match game. Please check in with them."
          );
        }
        res.redirect("/score");
      } else {
        res.redirect("/game");
      }
    });
  });

  app.post("/skip", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/signin");
    }

    gameResultTracker.skipQuestion(req.session.currentPhoto);
    res.redirect("/game");
  });

  app.get("/score", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect("/signin");
    }

    res.send(
      `Your final score is ${gameResultTracker.getScorePercentage()}%. <a href="/game">Play again</a>`
    );
  });

  // Server Setup
  app.listen(PORT, () => {
    console.log(`Face match game server running on http://localhost:${PORT}`);
  });

  return app;
}

module.exports = createFaceMatchApp;
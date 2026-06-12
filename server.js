const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");

const app = express();
const PORT = 3000;

app.use(express.json());

app.use(session({
  secret: "heritageToursSecret",
  resave: false,
  saveUninitialized: false
}));

const db = new sqlite3.Database("./DB_File.db", (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log("Connected to SQLite database.");
  }
});

app.use(express.static(path.join(__dirname, "Public")));

app.get("/api/tours/city/:city", (req, res) => {
  const city = req.params.city;

  const sql = `
    SELECT tours.*,
           MIN(availability.theDate) AS nextDate,
           availability.maxPlaces
    FROM tours
    JOIN availability ON tours.id = availability.tourID
    WHERE LOWER(city) = LOWER(?)
    AND availability.maxPlaces > 0
    GROUP BY tours.id
  `;

  db.all(sql, [city], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });
});

app.get("/api/tours/:tourID/availability", (req, res) => {
  const tourID = req.params.tourID;

  const sql = `
    SELECT theDate, maxPlaces
    FROM availability
    WHERE tourID = ?
    AND maxPlaces > 0
    ORDER BY theDate
  `;

  db.all(sql, [tourID], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });
});

app.get("/api/tours/:city/:theme", (req, res) => {
  const city = req.params.city;
  const theme = req.params.theme;

  const sql = `
    SELECT tours.*,
           MIN(availability.theDate) AS nextDate,
           availability.maxPlaces
    FROM tours
    JOIN availability ON tours.id = availability.tourID
    WHERE LOWER(city) = LOWER(?)
    AND LOWER(theme) = LOWER(?)
    AND availability.maxPlaces > 0
    GROUP BY tours.id
  `;

  db.all(sql, [city, theme], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });
});

app.post("/api/login", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required"
    });
  }

  const sql = `
    SELECT *
    FROM users
    WHERE username = ?
    AND password = ?
  `;

  db.get(sql, [username, password], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!user) {
      return res.status(401).json({
        error: "Invalid username or password"
      });
    }

    req.session.user = {
      username: user.username,
      isAdmin: user.isAdmin
    };

    res.json({
      message: "Login successful",
      username: user.username
    });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        error: "Logout failed"
      });
    }

    res.json({
      message: "Logout successful"
    });
  });
});

app.post("/api/bookings", (req, res) => {
  if (!req.session.user) {
    return res.status(403).json({
      error: "You must be logged in to book a tour"
    });
  }

  const tourID = req.body.tourID;
  const theDate = req.body.theDate;
  const visitors = req.body.visitors;

  if (!tourID || !theDate || !visitors) {
    return res.status(400).json({
      error: "Incomplete booking data"
    });
  }

  const today = new Date();
  const currentYear = today.getFullYear().toString().substring(2);
  const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
  const currentDay = String(today.getDate()).padStart(2, "0");
  const todayFormatted = currentYear + currentMonth + currentDay;

  if (theDate < todayFormatted) {
    return res.status(400).json({
      error: "Cannot book tours in the past"
    });
  }

  const checkAvailabilitySql = `
    SELECT maxPlaces
    FROM availability
    WHERE tourID = ? AND theDate = ?
  `;

  db.get(checkAvailabilitySql, [tourID, theDate], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!row) {
      return res.status(404).json({
        error: "No availability found for this tour and date"
      });
    }

    if (row.maxPlaces < visitors) {
      return res.status(409).json({
        error: "Not enough places available"
      });
    }

    const username = req.session.user.username;

    const insertBookingSql = `
      INSERT INTO bookings (tourID, theDate, username, visitors)
      VALUES (?, ?, ?, ?)
    `;

    db.run(insertBookingSql, [tourID, theDate, username, visitors], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const bookingID = this.lastID;

      const updateAvailabilitySql = `
        UPDATE availability
        SET maxPlaces = maxPlaces - ?
        WHERE tourID = ? AND theDate = ?
      `;

      db.run(updateAvailabilitySql, [visitors, tourID, theDate], (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        res.status(201).json({
          message: "Booking created and availability updated successfully",
          bookingID: bookingID
        });
      });
    });
  });
});

app.get("/api/admin/bookings", (req, res) => {
  if (!req.session.user || req.session.user.isAdmin !== 1) {
    return res.status(403).json({
      error: "Admin access required"
    });
  }

  const sql = `
    SELECT bookings.id,
           bookings.tourID,
           tours.title,
           bookings.theDate,
           bookings.username,
           bookings.visitors
    FROM bookings
    JOIN tours ON bookings.tourID = tours.id
    ORDER BY bookings.id DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
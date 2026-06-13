// Import the packages needed for the application
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const session = require("express-session");

// Create the Express application
const app = express();

// The coursework brief requires the app to run on port 3000
const PORT = 3000;

// Allows Express to read JSON data sent from the frontend
app.use(express.json());

// Session middleware stores login information on the server side.
// This is used to remember whether a user is logged in.
app.use(session({
  secret: "heritageToursSecret",
  resave: false,
  saveUninitialized: false
}));

// Connect to the SQLite database using better-sqlite3.
// This removes the need for callback-based database code.
const db = new Database("./DB_File.db");

console.log("Connected to SQLite database.");

// Enable foreign key support for stronger database integrity.
db.pragma("foreign_keys = ON");

// Serve the frontend files from the Public folder
app.use(express.static(path.join(__dirname, "Public")));

// ----------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------

// Checks whether the current user is logged in.
function isLoggedIn(req) {
  return req.session.user;
}

// Checks whether the current user is an administrator.
function isAdmin(req) {
  return req.session.user && req.session.user.isAdmin === 1;
}

// Converts today's date into YYMMDD format.
// The database stores dates in this coursework format.
function getTodayYYMMDD() {
  const today = new Date();

  const currentYear = today.getFullYear().toString().substring(2);
  const currentMonth = String(today.getMonth() + 1).padStart(2, "0");
  const currentDay = String(today.getDate()).padStart(2, "0");

  return currentYear + currentMonth + currentDay;
}

// ----------------------------------------------------
// TOUR SEARCH ROUTES
// ----------------------------------------------------

// Route 1: Search tours by city.
// This returns tours in a selected city and includes the next available date.
app.get("/api/tours/city/:city", (req, res) => {

  try {
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

    const rows = db.prepare(sql).all(city);

    res.json(rows);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

// Route 2: Return available dates for one tour.
// This is used by the frontend to show valid dates and remaining places.
app.get("/api/tours/:tourID/availability", (req, res) => {

  try {
    const tourID = req.params.tourID;

    const sql = `
      SELECT theDate, maxPlaces
      FROM availability
      WHERE tourID = ?
      AND maxPlaces > 0
      ORDER BY theDate
    `;

    const rows = db.prepare(sql).all(tourID);

    res.json(rows);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

// Route 3: Search tours by both city and theme.
// This allows more specific filtering from the frontend.
app.get("/api/tours/:city/:theme", (req, res) => {

  try {
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

    const rows = db.prepare(sql).all(city, theme);

    res.json(rows);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

// ----------------------------------------------------
// LOGIN AND LOGOUT ROUTES
// ----------------------------------------------------

// Login route.
// Checks the submitted username and password against the users table.
app.post("/api/login", (req, res) => {

  try {
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

    const user = db.prepare(sql).get(username, password);

    if (!user) {
      return res.status(401).json({
        error: "Invalid username or password"
      });
    }

    // Store the logged-in user in the session.
    // This lets the server remember the user between requests.
    req.session.user = {
      username: user.username,
      isAdmin: user.isAdmin
    };

    res.json({
      message: "Login successful",
      username: user.username
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

// Logout route.
// Destroys the current session so the user is no longer logged in.
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

// ----------------------------------------------------
// BOOKING ROUTE
// ----------------------------------------------------

// Create a booking.
// Only logged-in users are allowed to book a tour.
app.post("/api/bookings", (req, res) => {

  try {
    if (!isLoggedIn(req)) {
      return res.status(403).json({
        error: "You must be logged in to book a tour"
      });
    }

    const tourID = req.body.tourID;
    const theDate = req.body.theDate;
    const visitors = Number(req.body.visitors);

    // Basic validation for missing or invalid booking data
    if (!tourID || !theDate || !visitors || visitors <= 0) {
      return res.status(400).json({
        error: "Incomplete booking data"
      });
    }

    const todayFormatted = getTodayYYMMDD();

    // Prevent users from booking a date in the past
    if (theDate < todayFormatted) {
      return res.status(400).json({
        error: "Cannot book tours in the past"
      });
    }

    // Check that the selected tour and date exist and still have places
    const checkAvailabilitySql = `
      SELECT maxPlaces
      FROM availability
      WHERE tourID = ? AND theDate = ?
    `;

    const availability = db
      .prepare(checkAvailabilitySql)
      .get(tourID, theDate);

    if (!availability) {
      return res.status(404).json({
        error: "No availability found for this tour and date"
      });
    }

    if (availability.maxPlaces < visitors) {
      return res.status(409).json({
        error: "Not enough places available"
      });
    }

    // The username comes from the logged-in session, not from the frontend.
    // This prevents users from pretending to book as someone else.
    const username = req.session.user.username;

    // better-sqlite3 supports clean transactions.
    // Both operations succeed together, or neither is committed.
    const createBookingTransaction = db.transaction(() => {

      const insertBookingSql = `
        INSERT INTO bookings (tourID, theDate, username, visitors)
        VALUES (?, ?, ?, ?)
      `;

      const insertResult = db
        .prepare(insertBookingSql)
        .run(tourID, theDate, username, visitors);

      const updateAvailabilitySql = `
        UPDATE availability
        SET maxPlaces = maxPlaces - ?
        WHERE tourID = ? AND theDate = ?
      `;

      db
        .prepare(updateAvailabilitySql)
        .run(visitors, tourID, theDate);

      return insertResult.lastInsertRowid;

    });

    const bookingID = createBookingTransaction();

    res.status(201).json({
      message: "Booking created and availability updated successfully",
      bookingID: bookingID
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

// ----------------------------------------------------
// ADMIN ROUTES
// ----------------------------------------------------

// Admin route: view all bookings.
// Only users with isAdmin = 1 can access this route.
app.get("/api/admin/bookings", (req, res) => {

  try {
    if (!isAdmin(req)) {
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

    const rows = db.prepare(sql).all();

    res.json(rows);

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

// Admin route: delete a booking.
// This allows administrators to remove cancelled or incorrect bookings.
app.delete("/api/admin/bookings/:id", (req, res) => {

  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        error: "Admin access required"
      });
    }

    const bookingID = req.params.id;

    const sql = `
      DELETE FROM bookings
      WHERE id = ?
    `;

    const result = db.prepare(sql).run(bookingID);

    if (result.changes === 0) {
      return res.status(404).json({
        error: "Booking not found"
      });
    }

    res.json({
      message: "Booking deleted successfully"
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

// Admin route: add a new tour.
// This extends the admin functionality beyond viewing bookings.
app.post("/api/admin/tours", (req, res) => {

  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        error: "Admin access required"
      });
    }

    const title = req.body.title;
    const city = req.body.city;
    const theme = req.body.theme;
    const latitude = req.body.latitude;
    const longitude = req.body.longitude;
    const description = req.body.description;

    if (!title || !city || !theme || !latitude || !longitude || !description) {
      return res.status(400).json({
        error: "Incomplete tour data"
      });
    }

    const sql = `
      INSERT INTO tours (title, city, theme, latitude, longitude, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = db
      .prepare(sql)
      .run(title, city, theme, latitude, longitude, description);

    res.status(201).json({
      message: "Tour created successfully",
      tourID: result.lastInsertRowid
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

// Admin route: add availability for a tour.
// This allows administrators to create new available dates.
app.post("/api/admin/availability", (req, res) => {

  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        error: "Admin access required"
      });
    }

    const tourID = req.body.tourID;
    const theDate = req.body.theDate;
    const maxPlaces = req.body.maxPlaces;

    if (!tourID || !theDate || !maxPlaces) {
      return res.status(400).json({
        error: "Incomplete availability data"
      });
    }

    const sql = `
      INSERT INTO availability (tourID, theDate, maxPlaces)
      VALUES (?, ?, ?)
    `;

    const result = db
      .prepare(sql)
      .run(tourID, theDate, maxPlaces);

    res.status(201).json({
      message: "Availability created successfully",
      availabilityID: result.lastInsertRowid
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }

});

app.get("/api/admin/tours", (req, res) => {

  try {

    if (!isAdmin(req)) {
      return res.status(403).json({
        error: "Admin access required"
      });
    }

    const sql = `
      SELECT id, title, city, theme, latitude, longitude, description
      FROM tours
      ORDER BY id ASC
    `;

    const tours = db.prepare(sql).all();

    res.json(tours);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});
// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const map = L.map("map").setView([54.5, -3], 6);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let markers = [];

const tourImages = {
  "Old Town Highlights Walk": "images/Old Town Highlights Walk.jpg",
  "Roman Bath Discovery Tour": "images/Roman Bath Discovery Tour.jpg",
  "Industrial Heritage Route": "images/Industrial Heritage Route.jpg",
  "Castle and Crown Trail": "images/Castle and Crown Trail.jpg",
  "Docklands and Trade Tour": "images/Maritime.jpg",
  "Victorian Secrets Walk": "images/Victorian Secrets Walk.jpg",
  "Cathedral Quarter Tour": "images/Cathedral Quarter Tour.jpg",
  "Walls and Vikings Experience": "images/Walls and Vikings Experience.jpg"
};

// -----------------------------
// LOGIN
// -----------------------------

const loginButton = document.getElementById("loginButton");

loginButton.addEventListener("click", () => {
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const loginMessage = document.getElementById("loginMessage");

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (username === "" || password === "") {
    loginMessage.textContent = "Please enter username and password.";
    return;
  }

  fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: username,
      password: password
    })
  })
  .then(response => response.json())
  .then(data => {
    loginMessage.textContent = data.message || data.error;
  });
});

// -----------------------------
// LOGOUT
// -----------------------------

const logoutButton = document.getElementById("logoutButton");

logoutButton.addEventListener("click", () => {
  const loginMessage = document.getElementById("loginMessage");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");

  fetch("/api/logout", {
    method: "POST"
  })
  .then(response => response.json())
  .then(data => {
    loginMessage.textContent = data.message || data.error;

    usernameInput.value = "";
    passwordInput.value = "";
  });
});

// -----------------------------
// SEARCH TOURS
// -----------------------------

const searchButton = document.getElementById("searchButton");

searchButton.addEventListener("click", () => {
  const cityInput = document.getElementById("cityInput");
  const themeInput = document.getElementById("themeInput");
  const messageElement = document.getElementById("message");

  const city = cityInput.value.trim();
  const theme = themeInput.value.trim();

  if (city === "") {
    messageElement.innerHTML = "<p>Please enter a city before searching.</p>";
    return;
  }

  let url = `/api/tours/city/${city}`;

  if (theme !== "") {
    url = `/api/tours/${city}/${theme}`;
  }

  fetch(url)
    .then(response => response.json())
    .then(tours => {
      messageElement.innerHTML = "";

      markers.forEach(marker => {
        map.removeLayer(marker);
      });

      markers = [];

      if (tours.length === 0) {
        messageElement.innerHTML = "<p>No tours found for this search.</p>";
        return;
      }

      tours.forEach(tour => {
        const imagePath =
          tourImages[tour.title] || "images/Old Town Highlights Walk.jpg";

        messageElement.innerHTML += `
          <div class="tour-card">
            <img
              src="${imagePath}"
              alt="${tour.title}"
              class="tour-image"
            >

            <h3>${tour.title}</h3>

            <p><strong>City:</strong> ${tour.city}</p>
            <p><strong>Theme:</strong> ${tour.theme}</p>
            <p>${tour.description}</p>

            <p><strong>Next available date:</strong> ${formatDate(tour.nextDate)}</p>
            <p><strong>Places left:</strong> ${tour.maxPlaces}</p>

            <div
              id="availability-${tour.id}"
              class="availability-box"
            >
              Loading available dates...
            </div>
          </div>
        `;

        const marker = L.marker([tour.latitude, tour.longitude])
          .addTo(map)
          .bindPopup(`
            <div class="popup-content">
              <strong>${tour.title}</strong><br>
              <span>${tour.city}</span><br>
              <span>${tour.theme}</span>

              <p>${tour.description}</p>

              <label>Date:</label><br>

              <input
                type="date"
                id="date-${tour.id}"
                min="${new Date().toISOString().split("T")[0]}"
              ><br><br>

              <label>Visitors:</label><br>

              <input
                type="number"
                id="visitors-${tour.id}"
                min="1"
                value="1"
              ><br><br>

              <button onclick="bookTourFromPopup(${tour.id})">
                Book Tour
              </button>
            </div>
          `);

        markers.push(marker);

        loadAvailabilityForTour(tour.id);
      });

      if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), {
          padding: [40, 40]
        });
      }
    });
});

// -----------------------------
// AVAILABILITY DISPLAY
// -----------------------------

function loadAvailabilityForTour(tourID) {
  fetch(`/api/tours/${tourID}/availability`)
    .then(response => response.json())
    .then(dates => {
      const availabilityBox =
        document.getElementById(`availability-${tourID}`);

      if (!availabilityBox) return;

      availabilityBox.innerHTML = "<strong>Available dates:</strong>";

      if (dates.length === 0) {
        availabilityBox.innerHTML += "<p>No available dates.</p>";
        return;
      }

      dates.forEach(date => {
        availabilityBox.innerHTML += `
          <p>${formatDate(date.theDate)} — ${date.maxPlaces} places left</p>
        `;
      });
    });
}

// -----------------------------
// DATE FORMATTER
// -----------------------------

function formatDate(dateValue) {
  if (!dateValue) {
    return "Not available";
  }

  return (
    "20" +
    dateValue.substring(0, 2) +
    "-" +
    dateValue.substring(2, 4) +
    "-" +
    dateValue.substring(4, 6)
  );
}

// -----------------------------
// BOOK TOUR
// -----------------------------

function bookTour(tourID, theDate, visitors) {
  fetch("/api/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tourID: tourID,
      theDate: theDate,
      visitors: visitors
    })
  })
  .then(response => response.json())
  .then(data => {
    alert(data.message || data.error);
  });
}

function bookTourFromPopup(tourID) {
  const dateInput = document.getElementById(`date-${tourID}`);
  const visitorsInput = document.getElementById(`visitors-${tourID}`);

  const selectedDate = dateInput.value;

  if (selectedDate === "") {
    alert("Please select a date before booking.");
    return;
  }

  const theDate = selectedDate
    .replaceAll("-", "")
    .substring(2);

  const visitors = visitorsInput.value;

  if (visitors <= 0) {
    alert("Please enter at least one visitor.");
    return;
  }

  bookTour(tourID, theDate, visitors);
}

// -----------------------------
// ADMIN: VIEW BOOKINGS
// -----------------------------

const loadBookingsButton = document.getElementById("loadBookingsButton");

loadBookingsButton.addEventListener("click", () => {
  loadAdminBookings();
});

function loadAdminBookings() {
  const adminBookings = document.getElementById("adminBookings");

  fetch("/api/admin/bookings")
    .then(response => response.json())
    .then(data => {
      adminBookings.innerHTML = "";

      if (data.error) {
        adminBookings.innerHTML = `<p>${data.error}</p>`;
        return;
      }

      data.forEach(booking => {
        adminBookings.innerHTML += `
          <div class="booking-card">
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Tour:</strong> ${booking.title}</p>
            <p><strong>Date:</strong> ${formatDate(booking.theDate)}</p>
            <p><strong>User:</strong> ${booking.username}</p>
            <p><strong>Visitors:</strong> ${booking.visitors}</p>

            <button onclick="deleteBooking(${booking.id})">
              Delete Booking
            </button>
          </div>
        `;
      });
    });
}

// -----------------------------
// ADMIN: DELETE BOOKING
// -----------------------------

function deleteBooking(bookingID) {
  fetch(`/api/admin/bookings/${bookingID}`, {
    method: "DELETE"
  })
  .then(response => response.json())
  .then(data => {
    alert(data.message || data.error);
    loadAdminBookings();
  });
}

// -----------------------------
// ADMIN: ADD TOUR
// -----------------------------

const addTourButton = document.getElementById("addTourButton");

addTourButton.addEventListener("click", () => {
  const addTourMessage = document.getElementById("addTourMessage");

  const title = document.getElementById("adminTitle").value.trim();
  const city = document.getElementById("adminCity").value.trim();
  const theme = document.getElementById("adminTheme").value.trim();
  const latitude = document.getElementById("adminLatitude").value.trim();
  const longitude = document.getElementById("adminLongitude").value.trim();
  const description =
    document.getElementById("adminDescription").value.trim();

  if (
    title === "" ||
    city === "" ||
    theme === "" ||
    latitude === "" ||
    longitude === "" ||
    description === ""
  ) {
    addTourMessage.textContent = "Please complete all tour fields.";
    return;
  }

  fetch("/api/admin/tours", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: title,
      city: city,
      theme: theme,
      latitude: latitude,
      longitude: longitude,
      description: description
    })
  })
  .then(response => response.json())
  .then(data => {
    addTourMessage.textContent = data.message || data.error;

    if (data.tourID) {
      addTourMessage.textContent += ` Tour ID: ${data.tourID}`;

      document.getElementById("adminTitle").value = "";
      document.getElementById("adminCity").value = "";
      document.getElementById("adminTheme").value = "";
      document.getElementById("adminLatitude").value = "";
      document.getElementById("adminLongitude").value = "";
      document.getElementById("adminDescription").value = "";
    }
  });
});

// -----------------------------
// ADMIN: ADD AVAILABILITY
// -----------------------------

const addAvailabilityButton =
  document.getElementById("addAvailabilityButton");

addAvailabilityButton.addEventListener("click", () => {
  const availabilityMessage =
    document.getElementById("availabilityMessage");

  const tourID =
    document.getElementById("availabilityTourID").value.trim();

  const theDate =
    document.getElementById("availabilityDate").value.trim();

  const maxPlaces =
    document.getElementById("availabilityPlaces").value.trim();

  if (tourID === "" || theDate === "" || maxPlaces === "") {
    availabilityMessage.textContent =
      "Please complete all availability fields.";
    return;
  }

  fetch("/api/admin/availability", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tourID: tourID,
      theDate: theDate,
      maxPlaces: maxPlaces
    })
  })
  .then(response => response.json())
  .then(data => {
    availabilityMessage.textContent = data.message || data.error;

    if (data.availabilityID) {
      availabilityMessage.textContent +=
        ` Availability ID: ${data.availabilityID}`;

      document.getElementById("availabilityTourID").value = "";
      document.getElementById("availabilityDate").value = "";
      document.getElementById("availabilityPlaces").value = "";
    }
  });
});

// -----------------------------
// ADMIN: VIEW ALL TOURS
// -----------------------------

const loadToursButton = document.getElementById("loadToursButton");

loadToursButton.addEventListener("click", () => {
  const adminTours = document.getElementById("adminTours");

  fetch("/api/admin/tours")
    .then(response => response.json())
    .then(data => {
      adminTours.innerHTML = "";

      if (data.error) {
        adminTours.innerHTML = `<p>${data.error}</p>`;
        return;
      }

      data.forEach(tour => {
        adminTours.innerHTML += `
          <div class="booking-card">
            <p><strong>Tour ID:</strong> ${tour.id}</p>
            <p><strong>Title:</strong> ${tour.title}</p>
            <p><strong>City:</strong> ${tour.city}</p>
            <p><strong>Theme:</strong> ${tour.theme}</p>
            <p><strong>Latitude:</strong> ${tour.latitude}</p>
            <p><strong>Longitude:</strong> ${tour.longitude}</p>
            <p><strong>Description:</strong> ${tour.description}</p>
          </div>
        `;
      });
    });
});
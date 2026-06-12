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
        const imagePath = tourImages[tour.title] || "images/Old Town Highlights Walk.jpg";

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

            <div
              id="availability-${tour.id}"
              class="availability-box"
            >
              Loading available dates...
            </div>

            <p><strong>Next available date:</strong> ${formatDate(tour.nextDate)}</p>

            <p><strong>Places left:</strong> ${tour.maxPlaces}</p>

            <div id="availability-${tour.id}" class="availability-box">
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

        fetch(`/api/tours/${tour.id}/availability`)
          .then(response => response.json())
          .then(dates => {

            const availabilityBox =
              document.getElementById(`availability-${tour.id}`);

            if (!availabilityBox) return;

            availabilityBox.innerHTML =
              "<strong>Available dates:</strong>";

            if (dates.length === 0) {

              availabilityBox.innerHTML += `
                <p>No available dates.</p>
              `;

              return;
            }

            dates.forEach(date => {

              const formattedDate =
                `20${date.theDate.substring(0,2)}-` +
                `${date.theDate.substring(2,4)}-` +
                `${date.theDate.substring(4,6)}`;

              availabilityBox.innerHTML += `
                <p>
                  ${formattedDate}
                  — ${date.maxPlaces} places left
                </p>
              `;

            });

          });

        fetch(`/api/tours/${tour.id}/availability`)
          .then(response => response.json())
          .then(dates => {
            const availabilityBox = document.getElementById(`availability-${tour.id}`);

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
      });

      if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), {
          padding: [40, 40]
        });
      }
    });
});

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

const loadBookingsButton = document.getElementById("loadBookingsButton");

loadBookingsButton.addEventListener("click", () => {
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
          </div>
        `;
      });
    });
});
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

dotenv.config();

// Initialisation de Firebase Admin SDK
initializeApp();
const db = getFirestore();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

let onlineUsers = {}; // Utilisateurs connectés temporairement

io.on("connection", (socket) => {
  console.log("Un utilisateur est connecté :", socket.id);

  socket.on("user_connected", async (user) => {
    onlineUsers[socket.id] = user;
    io.emit("update_users", onlineUsers);

    // Vérifie si l'utilisateur existe dans Firestore
    const userRef = db.collection("users").doc(user.uid);
    const doc = await userRef.get();

    if (!doc.exists) {
      await userRef.set({
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        friends: [],
        online: true,
      });
    } else {
      await userRef.update({ online: true });
    }
  });

  socket.on("send_message", (message) => {
    io.emit("receive_message", message);
  });

  socket.on("disconnect", async () => {
    console.log("Utilisateur déconnecté :", socket.id);
    if (onlineUsers[socket.id]) {
      const userRef = db.collection("users").doc(onlineUsers[socket.id].uid);
      await userRef.update({ online: false });
    }
    delete onlineUsers[socket.id];
    io.emit("update_users", onlineUsers);
  });
});

server.listen(6500, () => {
  console.log("Serveur WebSocket en écoute sur le port 6500");
});
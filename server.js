const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");
const { getFirestore, doc, setDoc, updateDoc, getDoc, collection, onSnapshot } = require("firebase-admin/firestore");
// const serviceAccount = require("./serviceAccount.json");
const serviceAccount = require('./serviceAccountKey.json');

dotenv.config();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = getFirestore();
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

let onlineUsers = {};

io.on("connection", async (socket) => {
  console.log(`✅ Utilisateur connecté : ${socket.id}`);

  socket.on("user_connected", async (userData) => {
    const { uid, displayName, photoURL } = userData;
    onlineUsers[uid] = { uid, displayName, photoURL, socketId: socket.id };

    // Met à jour Firestore pour marquer l'utilisateur comme "en ligne"
    await setDoc(doc(db, "users", uid), { name: displayName, photoURL, online: true }, { merge: true });

    io.emit("update_users", onlineUsers);
  });

  socket.on("send_message", async (message) => {
    const { senderId, receiverId, text } = message;

    // Sauvegarde dans Firestore
    await setDoc(doc(db, "messages", `${senderId}_${receiverId}_${Date.now()}`), {
      senderId,
      receiverId,
      text,
      timestamp: new Date(),
    });

    if (onlineUsers[receiverId]) {
      io.to(onlineUsers[receiverId].socketId).emit("receive_message", message);
    }
  });

  socket.on("disconnect", async () => {
    let user = Object.values(onlineUsers).find((user) => user.socketId === socket.id);
    if (user) {
      console.log(`❌ Utilisateur déconnecté : ${user.displayName}`);
      delete onlineUsers[user.uid];

      await updateDoc(doc(db, "users", user.uid), { online: false });

      io.emit("update_users", onlineUsers);
    }
  });
});

server.listen(process.env.PORT || 6500, () => {
  console.log(`🚀 Serveur WebSocket en écoute sur le port ${process.env.PORT || 6500}`);
});

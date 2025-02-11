const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configuration CORS
const corsOptions = {
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true,
};
app.use(cors(corsOptions));

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();
const io = new Server(server, { cors: corsOptions });

let onlineUsers = {};

io.on("connection", async (socket) => {
  console.log(`✅ Utilisateur connecté : ${socket.id}`);

  socket.on("user_connected", async (userData) => {
    const { uid, displayName, photoURL } = userData;
    onlineUsers[uid] = { uid, displayName, photoURL, socketId: socket.id };

    // ✅ Sauvegarder l'utilisateur dans Firestore
    await db.collection("users").doc(uid).set(
      {
        displayName,
        photoURL,
        online: true, // Met l'utilisateur en ligne
      },
      { merge: true }
    );

    // ✅ Envoyer la liste des utilisateurs à tous les clients
    io.emit("update_users", Object.values(onlineUsers));
  });

  socket.on("send_message", async (message) => {
    const { senderId, receiverId, text } = message;

    // ✅ Sauvegarde du message dans Firestore
    await db.collection("messages").add({
      senderId,
      receiverId,
      text,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ✅ Envoie uniquement au destinataire
    if (onlineUsers[receiverId]) {
      io.to(onlineUsers[receiverId].socketId).emit("receive_message", message);
    }
  });

  socket.on("disconnect", async () => {
    let user = Object.values(onlineUsers).find((user) => user.socketId === socket.id);
    if (user) {
      console.log(`❌ Utilisateur déconnecté : ${user.displayName}`);
      delete onlineUsers[user.uid];

      // ✅ Met à jour Firestore pour marquer l'utilisateur comme "hors ligne"
      await db.collection("users").doc(user.uid).update({ online: false });

      io.emit("update_users", Object.values(onlineUsers));
    }
  });
});

server.listen(process.env.PORT || 6500, () => {
  console.log(`🚀 Serveur WebSocket en écoute sur le port ${process.env.PORT || 6500}`);
});
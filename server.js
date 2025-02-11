const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const admin = require("firebase-admin");
const dotenv = require("dotenv");
const { getFirestore, doc, setDoc, updateDoc, getDoc, collection, onSnapshot } = require("firebase-admin/firestore");

// 🔹 Chargement des variables d'environnement
dotenv.config();

// 🔹 Initialisation de Firebase Admin
const serviceAccount = require("./serviceAccount.json"); // Remplace par ton fichier JSON Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = getFirestore();
const app = express();
const server = http.createServer(app);

// 🔹 Configuration CORS
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true,
}));

// 🔹 Initialisation du serveur WebSocket
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// 🔹 Stocker les utilisateurs en ligne
let onlineUsers = {};

io.on("connection", async (socket) => {
  console.log(`✅ Utilisateur connecté : ${socket.id}`);

  /**
   * 📌 Lorsqu'un utilisateur se connecte, on l'ajoute à Firestore
   */
  socket.on("user_connected", async (userData) => {
    const { uid, displayName, photoURL } = userData;

    // Ajout de l'utilisateur à la liste des utilisateurs en ligne
    onlineUsers[uid] = { uid, displayName, photoURL, socketId: socket.id };

    // 🔹 Met à jour Firestore pour marquer l'utilisateur comme "en ligne"
    await setDoc(doc(db, "users", uid), { 
      name: displayName, 
      photoURL, 
      online: true 
    }, { merge: true });

    io.emit("update_users", Object.values(onlineUsers)); // Mise à jour pour tous
  });

  /**
   * 📌 Envoi de messages entre utilisateurs seulement s'ils sont amis
   */
  socket.on("send_message", async (message) => {
    const { senderId, receiverId, text } = message;

    const senderRef = doc(db, "users", senderId);
    const senderDoc = await getDoc(senderRef);

    // Vérifie si les utilisateurs sont amis
    if (senderDoc.exists() && senderDoc.data().friends?.includes(receiverId)) {
      // 🔹 Sauvegarde du message dans Firestore
      await setDoc(doc(db, "messages", `${senderId}_${receiverId}_${Date.now()}`), {
        senderId,
        receiverId,
        text,
        timestamp: new Date(),
      });

      // 🔹 Envoie le message au destinataire s'il est en ligne
      if (onlineUsers[receiverId]) {
        io.to(onlineUsers[receiverId].socketId).emit("receive_message", message);
      }
    } else {
      console.log(`🚫 Message bloqué : ${senderId} et ${receiverId} ne sont pas amis.`);
    }
  });

  /**
   * 📌 Gestion de la déconnexion d'un utilisateur
   */
  socket.on("disconnect", async () => {
    let user = Object.values(onlineUsers).find((user) => user.socketId === socket.id);
    if (user) {
      console.log(`❌ Utilisateur déconnecté : ${user.displayName}`);
      delete onlineUsers[user.uid];

      // 🔹 Met à jour Firestore pour indiquer que l'utilisateur est hors ligne
      await updateDoc(doc(db, "users", user.uid), { online: false });

      io.emit("update_users", Object.values(onlineUsers)); // Mise à jour pour tous
    }
  });
});

// 🔹 Démarrage du serveur
const PORT = process.env.PORT || 6500;
server.listen(PORT, () => {
  console.log(`🚀 Serveur WebSocket en écoute sur le port ${PORT}`);
});
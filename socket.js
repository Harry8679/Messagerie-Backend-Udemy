// import { io } from "socket.io-client";
const io = require('../lib/socket.io');

const socket = io("http://localhost:5000"); // URL de ton backend Socket.io
export default socket;

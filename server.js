const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store user information
let userMap = new Map(); // socket.id -> { userName, ... }
let waitingUsers = new Set();

io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // Handle user info (name) when user connects
  socket.on("user-info", (data) => {
    const userName = data.userName || 'Anonymous';
    userMap.set(socket.id, { userName });
    console.log(`👤 User ${socket.id} set name: ${userName}`);
  });

  socket.on("find-partner", (data) => {
    const userName = data.userName || 'Anonymous';
    
    // Update user info
    userMap.set(socket.id, { userName });
    
    console.log(`🔍 ${userName} (${socket.id}) is looking for a partner`);

    // Look for a waiting user (exclude self)
    const partnerId = [...waitingUsers].find((id) => id !== socket.id);

    if (partnerId) {
      // Found a partner immediately
      waitingUsers.delete(partnerId);

      const partnerInfo = userMap.get(partnerId) || { userName: 'Anonymous' };
      const currentUserInfo = userMap.get(socket.id) || { userName: 'Anonymous' };

      console.log(`🤝 Partnership: ${currentUserInfo.userName} (${socket.id}) <--> ${partnerInfo.userName} (${partnerId})`);

      // --- CRITICAL FIX: Only ONE side should create offer ---
      
      // User who JUST clicked (socket.id) creates the offer
      // User who was WAITING (partnerId) waits for the offer
      
      // Notify NEW user (who just clicked) to create offer
      io.to(socket.id).emit("partner-found", { 
        partnerId: partnerId,
        userName: partnerInfo.userName,
        shouldInitiate: true // This user should create the offer
      });
      
      // Notify WAITING user to wait for offer
      io.to(partnerId).emit("immediate-connection", { 
        partnerId: socket.id,
        userName: currentUserInfo.userName,
        shouldInitiate: false // This user should wait for offer
      });
      
    } else {
      // No partner found, add self to waiting list
      if (!waitingUsers.has(socket.id)) {
        waitingUsers.add(socket.id);
        console.log(`⏳ ${userName} (${socket.id}) added to waiting list`);
        
        io.to(socket.id).emit("waiting", { 
          message: "You are waiting for a partner" 
        });
      }
    }
  });

  socket.on("offer", (data) => {
  console.log(`📩 Offer from ${socket.id} -> ${data.to}`);
  io.to(data.to).emit("offer", {
    from: socket.id,
    sdp: data.sdp
  });
});

socket.on("answer", (data) => {
  console.log(`📩 Answer from ${socket.id} -> ${data.to}`);
  io.to(data.to).emit("answer", {
    from: socket.id,
    sdp: data.sdp
  });
});


  socket.on("ice-candidate", (data) => {
    const fromUser = userMap.get(socket.id) || { userName: 'Anonymous' };
    console.log(`📩 ICE Candidate from ${fromUser.userName} (${socket.id}) -> ${data.to}`);
    
    io.to(data.to).emit("ice-candidate", {
      from: socket.id,
      candidate: data.candidate,
    });
  });

  socket.on("disconnect", (reason) => {
    const userInfo = userMap.get(socket.id) || { userName: 'Unknown' };
    console.log(`⚠️ User disconnected: ${userInfo.userName} (${socket.id}) - Reason: ${reason}`);
    
    waitingUsers.delete(socket.id);
    userMap.delete(socket.id);
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
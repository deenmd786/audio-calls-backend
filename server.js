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

      // Notify both users with user names
      io.to(socket.id).emit("immediate-connection", { 
        partnerId: partnerId,
        userName: partnerInfo.userName 
      });
      
      io.to(partnerId).emit("partner-found", { 
        partnerId: socket.id,
        userName: currentUserInfo.userName 
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
    const fromUser = userMap.get(socket.id) || { userName: 'Anonymous' };
  const targetUserName = data.userInfo?.name || fromUser.userName;
    
    console.log(`📩 Offer from ${targetUserName} (${socket.id}) -> ${data.to}`);
    
    io.to(data.to).emit("offer", { 
      from: socket.id, 
      sdp: data.sdp,
    userInfo: data.userInfo || { userName: targetUserName }
    });
  });

  socket.on("answer", (data) => {
    const fromUser = userMap.get(socket.id) || { userName: 'Anonymous' };
    console.log(`📩 Answer from ${fromUser.userName} (${socket.id}) -> ${data.to}`);
    
    io.to(data.to).emit("answer", { 
      from: socket.id, 
      sdp: data.sdp,
    userInfo: data.userInfo || userMap.get(socket.id)
 
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

  // Send immediate user-info request when client connects
  socket.emit("request-user-info");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
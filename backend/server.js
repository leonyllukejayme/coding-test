const express = require('express');
const { Server } = require('socket.io')
const { createServer } = require('node:http')
const { join } = require('node:path');
const cors = require('cors')

const app = express();
const server = createServer(app)
const io = new Server(server)
const port = 3000

app.use(cors())

app.get('/', (req,res) =>{
    res.sendFile(join(__dirname, 'index.html'));
})

io.on('connection', (socket) => {
    console.log('a user connected')
    socket.on('chat message', (msg) => {
        console.log('message: ' + msg);
        io.emit('chat message', msg)
      });
})

server.listen(port, () => {
	console.log(`Listening to port ${port}`);
});

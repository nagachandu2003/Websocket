require('dotenv').config(); // Load environment variables from .env file

const WebSocket = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
const { OpenAI } = require('openai');
const textToSpeech = require('@google-cloud/text-to-speech');

// Initialize Deepgram client with the API key from environment variable
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// Initialize OpenAI client with the API key from environment variable
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize Google TTS client
const client = new textToSpeech.TextToSpeechClient();

const wss = new WebSocket.Server({ port: 8000 });
const contextMap = new Map(); // Store context for each session

wss.on('connection', (ws) => {
    console.log('Client connected');

    // Set up session ID or any unique identifier for the client
    ws.sessionId = Date.now().toString(); // For simplicity, using timestamp as session ID
    contextMap.set(ws.sessionId, []);

    let isListening = true; // Flag to indicate if the bot is currently listening
    let isResponding = false; // Flag to indicate if the bot is currently responding

    // Create a new Deepgram live transcription connection
    const live = deepgram.listen.live({ model: "nova" });

    live.on(LiveTranscriptionEvents.Open, () => {
        console.log('Deepgram live connection opened');

        ws.on('message', (message) => {
            if (isListening) {
                try {
                    live.send(message);
                } catch (error) {
                    console.error('Error sending audio data to Deepgram:', error.message);
                    ws.send('An error occurred while processing your request.');
                }
            }
        });

        live.on(LiveTranscriptionEvents.Transcript, async (data) => {
            if (isListening && !isResponding) {
                try {
                    if (data && data.channel && data.channel.alternatives[0].transcript) {
                        const transcript = data.channel.alternatives[0].transcript.trim();
                        console.log('Transcript:', transcript);

                        const sessionId = ws.sessionId;
                        const previousMessages = contextMap.get(sessionId) || [];

                        // Set listening to false and responding to true
                        isListening = false;
                        isResponding = true;

                        // Use OpenAI GPT-4 to get a response based on the transcript
                        const response = await openai.chat.completions.create({
                            model: "gpt-4",
                            messages: [
                                { role: "system", content: "You are a phone conversational assistant providing short and clear responses." },
                                ...previousMessages,
                                { role: "user", content: transcript }
                            ],
                            max_tokens: 100
                        });

                        const answer = response.choices[0].message.content.trim();
                        console.log('OpenAI response:', answer);

                        // Convert text response to speech
                        const [responseAudio] = await client.synthesizeSpeech({
                            input: { text: answer },
                            voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
                            audioConfig: { audioEncoding: 'MP3' },
                        });

                        const audioContent = responseAudio.audioContent;

                        // Send the audio file back to the client
                        ws.send(audioContent, { binary: true });

                        // Update context
                        contextMap.set(sessionId, [
                            ...previousMessages,
                            { role: "user", content: transcript },
                            { role: "assistant", content: answer }
                        ]);

                        // Set responding to false and listening to true after response is sent
                        isResponding = false;
                        isListening = true;
                    }
                } catch (error) {
                    console.error('Error processing transcription:', error.message);
                    ws.send('An error occurred while processing your request.');
                }
            }
        });

        live.keepAlive(); // Keep the connection alive
    });

    live.on('close', () => {
        console.log('Deepgram live connection closed');
    });

    live.on('error', (error) => {
        console.error('Deepgram live connection error:', error.message);
        ws.send('An error occurred while processing your request.');
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        live.finish(); 
        contextMap.delete(ws.sessionId); 
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        live.finish();
        contextMap.delete(ws.sessionId); 
    });
});

console.log('WebSocket server is running on ws://localhost:8000');



// require('dotenv').config(); // Load environment variables from .env file

// const WebSocket = require('ws');
// const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
// const { OpenAI } = require('openai');
// const textToSpeech = require('@google-cloud/text-to-speech');

// // Initialize Deepgram client with the API key from environment variable
// const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

// // Initialize OpenAI client with the API key from environment variable
// const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY
// });

// // Initialize Google TTS client
// const client = new textToSpeech.TextToSpeechClient();

// const wss = new WebSocket.Server({ port: 8000 });
// const contextMap = new Map(); // Store context for each session

// wss.on('connection', (ws) => {
//     console.log('Client connected');

//     // Set up session ID or any unique identifier for the client
//     ws.sessionId = Date.now().toString(); // For simplicity, using timestamp as session ID
//     contextMap.set(ws.sessionId, []);

//     // Create a new Deepgram live transcription connection
//     const live = deepgram.listen.live({ model: "nova" });

//     live.on(LiveTranscriptionEvents.Open, () => {
//         console.log('Deepgram live connection opened');

//         ws.on('message', (message) => {
//             try {
//                 live.send(message);
//             } catch (error) {
//                 console.error('Error sending audio data to Deepgram:', error.message);
//                 ws.send('An error occurred while processing your request.');
//             }
//         });

//         live.on(LiveTranscriptionEvents.Transcript, async (data) => {
//             try {
//                 if (data && data.channel && data.channel.alternatives[0].transcript) {
//                     const transcript = data.channel.alternatives[0].transcript.trim();
//                     console.log('Transcript:', transcript);

//                     const sessionId = ws.sessionId;
//                     const previousMessages = contextMap.get(sessionId) || [];

//                     // Use OpenAI GPT-4 to get a response based on the transcript
//                     const response = await openai.chat.completions.create({
//                         model: "gpt-4o",
//                         messages: [
//                             { role: "system", content: "You are a phone conversational assistant providing short and clear responses." },
//                             ...previousMessages,
//                             { role: "user", content: transcript }
//                         ],
//                         max_tokens: 100
//                     });

//                     const answer = response.choices[0].message.content.trim();
//                     console.log('OpenAI response:', answer);

//                     // Convert text response to speech
//                     const [responseAudio] = await client.synthesizeSpeech({
//                         input: { text: answer },
//                         voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
//                         audioConfig: { audioEncoding: 'MP3' },
//                     });

//                     const audioContent = responseAudio.audioContent;

//                     // Send the audio file back to the client
//                     ws.send(audioContent, { binary: true });

//                     // Update context
//                     contextMap.set(sessionId, [
//                         ...previousMessages,
//                         { role: "user", content: transcript },
//                         { role: "assistant", content: answer }
//                     ]);
//                 }
//             } catch (error) {
//                 console.error('Error processing transcription:', error.message);
//                 ws.send('An error occurred while processing your request.');
//             }
//         });

//         live.keepAlive(); // Keep the connection alive
//     });

//     live.on('close', () => {
//         console.log('Deepgram live connection closed');
//     });

//     live.on('error', (error) => {
//         console.error('Deepgram live connection error:', error.message);
//         ws.send('An error occurred while processing your request.');
//     });

//     ws.on('close', () => {
//         console.log('Client disconnected');
//         live.finish(); 
//         contextMap.delete(ws.sessionId); 
//     });

//     ws.on('error', (error) => {
//         console.error('WebSocket error:', error.message);
//         live.finish();
//         contextMap.delete(ws.sessionId); 
//     });
// });

// console.log('WebSocket server is running on ws://localhost:8000');
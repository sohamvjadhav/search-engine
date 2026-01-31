require('dotenv').config();
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

async function testConnection() {
    console.log("Testing Bedrock Connection...");
    console.log("Region:", process.env.BEDROCK_REGION || 'eu-north-1');
    console.log("Model:", process.env.BEDROCK_MODEL_ID || 'openai.gpt-oss-20b-1:0');
    console.log("Key Length:", process.env.AWS_BEARER_TOKEN_BEDROCK ? process.env.AWS_BEARER_TOKEN_BEDROCK.length : 0);

    const client = new BedrockRuntimeClient({
        region: process.env.BEDROCK_REGION || 'eu-north-1',
        credentials: {
            accessKeyId: process.env.AWS_BEARER_TOKEN_BEDROCK,
            secretAccessKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
            // Try adding session token just in case, though unlikely for this format
            // sessionToken: process.env.AWS_BEARER_TOKEN_BEDROCK 
        }
    });

    try {
        const payload = {
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 10
        };

        const command = new InvokeModelCommand({
            modelId: process.env.BEDROCK_MODEL_ID || 'openai.gpt-oss-20b-1:0',
            contentType: 'application/json',
            body: JSON.stringify(payload)
        });

        console.log("Sending request...");
        const response = await client.send(command);
        console.log("Success!");
        console.log(new TextDecoder().decode(response.body));
    } catch (error) {
        console.error("Connection Failed!");
        console.error("Error Name:", error.name);
        console.error("Error Message:", error.message);
        console.error("Error Code:", error.Code);
        console.error("Request ID:", error.$metadata ? error.$metadata.requestId : 'N/A');
    }
}

testConnection();

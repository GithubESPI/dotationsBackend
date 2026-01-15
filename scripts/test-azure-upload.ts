
import { BlobServiceClient } from '@azure/storage-blob';
import * as dotenv from 'dotenv';
import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

dotenv.config();

async function run() {
    console.log('🚀 Starting Azure Blob Storage Upload Test...');

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = 'dotationdoc';

    if (!connectionString) {
        console.error('❌ Error: AZURE_STORAGE_CONNECTION_STRING is missing in .env');
        process.exit(1);
    }

    // Debug format (safe log)
    if (!connectionString.includes('AccountKey=')) {
        console.error('❌ Error: AZURE_STORAGE_CONNECTION_STRING seems invalid. It does not contain "AccountKey=". Only a URL was found?');
        console.error('Value starts with: ' + connectionString.substring(0, 50) + '...');
        console.error('Expected format: DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net');
        process.exit(1);
    }

    // 1. Generate a dummy PDF in memory
    console.log('📄 Generating PDF...');
    const doc = new PDFDocument();
    const buffers: Buffer[] = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(buffers);
        console.log(`✅ PDF Generated (${pdfBuffer.length} bytes)`);

        // 2. Upload to Azure
        try {
            console.log(`☁️ Connecting to Azure Blob Storage container: ${containerName}...`);
            const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
            const containerClient = blobServiceClient.getContainerClient(containerName);

            // Ensure container exists
            // Note: In strict production we might not want to try create if we expect it to exist
            try {
                await containerClient.createIfNotExists();
                console.log(`   Container check/creation passed.`);
            } catch (e) {
                console.log(`   Container check warning (might already exist or permission issue): ${e.message}`);
            }

            const blobName = `test-dotation-${Date.now()}.pdf`;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);

            console.log(`📤 Uploading ${blobName}...`);
            await blockBlobClient.uploadData(pdfBuffer, {
                blobHTTPHeaders: { blobContentType: 'application/pdf' }
            });

            console.log(`✅ Upload Successful!`);
            console.log(`🌍 Blob URL: ${blockBlobClient.url}`);

        } catch (error: any) {
            console.error(`❌ Upload Failed:`, error.message);
        }
    });

    doc.fontSize(25).text('Test Dotation Azure Upload', 100, 100);
    doc.text(`Date: ${new Date().toISOString()}`);
    doc.text('This is a test file generated to verify Azure Blob Storage connectivity.');
    doc.end();
}

run();

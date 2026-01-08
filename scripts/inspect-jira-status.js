require('dotenv').config();
const axios = require('axios');

async function inspectStatus() {
    const baseUrl = process.env.JIRA_BASE_URL_ASSETS || process.env.JIRA_BASE_URL;
    const email = process.env.JIRA_EMAIL_ASSETS || process.env.JIRA_EMAIL;
    const token = process.env.JIRA_TOKEN_ASSETS || process.env.JIRA_API_TOKEN;
    const workspaceId = '60bbdf20-4698-44e2-b6c1-07ac483435a3'; // From logs

    if (!baseUrl || !email || !token) {
        console.error('Missing env vars');
        return;
    }

    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const headers = {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json'
    };

    try {
        // 1. Get Attributes for Object Type "Laptop" (We need to find the object type ID first)
        // For now, let's list object types to find Laptop
        console.log('Fetching object types...');
        // Note: The schema name was "Parc Informatique" in logs, we might need to find schema ID first but let's try to list object types if possible or assume a common ID.
        // The previous log showed: /jira-asset/schema/Parc%20Informatique/object-type/Laptop
        // Better: Get the specific asset from the logs (ID 1146) and see its "Status" attribute details

        // We can get the object type attributes for the object type of asset 1146.
        const assetId = '1146';
        const assetUrl = `${baseUrl}/gateway/api/jsm/assets/workspace/${workspaceId}/v1/object/${assetId}`;

        console.log(`Fetching asset ${assetId}...`);
        const assetRes = await axios.get(assetUrl, { headers });
        const asset = assetRes.data;

        // console.log('Asset data:', JSON.stringify(asset, null, 2));

        const objectTypeId = asset.objectTypeId || asset.objectType?.id;
        console.log(`Object Type ID: ${objectTypeId}`);

        if (!objectTypeId) {
            throw new Error('Could not find objectTypeId');
        }

        // 2. Get Attributes definition for this Object Type
        const attrUrl = `${baseUrl}/gateway/api/jsm/assets/workspace/${workspaceId}/v1/objecttype/${objectTypeId}/attributes`;
        const attrRes = await axios.get(attrUrl, { headers });

        const attributes = attrRes.data;
        const statusAttr = attributes.find(a => a.name.toLowerCase() === 'status' || a.name.toLowerCase() === 'statut');

        if (statusAttr) {
            console.log('Status Attribute ID:', statusAttr.id);
            console.log('Status Attribute Type:', statusAttr.type);
        } else {
            console.log('Status attribute not found in definitions:', attributes.map(a => a.name));
        }

        // 3. fetch Global Statuses
        if (statusAttr && statusAttr.type === 7) {
            console.log('Fetching available statuses...');
            const statusTypeUrl = `${baseUrl}/gateway/api/jsm/assets/workspace/${workspaceId}/v1/config/statustype`;
            try {
                const statusRes = await axios.get(statusTypeUrl, { headers });
                const statuses = statusRes.data;
                console.log('Total Statuses:', statuses.length);

                console.log('--- STATUS LIST ---');
                statuses.forEach(s => {
                    console.log(`ID: ${s.id}, Name: "${s.name}"`);
                });
                console.log('-------------------');

                // Find specific statuses
                const affecte = statuses.find(s => s.name.toUpperCase() === 'AFFECTE' || s.name.toUpperCase() === 'AFFECTÉ' || s.name.toUpperCase() === 'ASSIGNED');
                const enStock = statuses.find(s => s.name.toUpperCase() === 'EN STOCK' || s.name.toUpperCase() === 'IN STOCK');
                const enIntervention = statuses.find(s => s.name.toUpperCase() === 'EN INTERVENTION');

                console.log('Status "AFFECTE":', affecte ? `${affecte.name} (ID: ${affecte.id})` : 'NOT FOUND');
                console.log('Status "EN STOCK":', enStock ? `${enStock.name} (ID: ${enStock.id})` : 'NOT FOUND');
                console.log('Status "EN INTERVENTION":', enIntervention ? `${enIntervention.name} (ID: ${enIntervention.id})` : 'NOT FOUND');

                console.log('All Status Names:', statuses.map(s => s.name).join(', '));
            } catch (e) {
                console.log('Could not fetch global statuses:', e.message);
            }
        }

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

inspectStatus();

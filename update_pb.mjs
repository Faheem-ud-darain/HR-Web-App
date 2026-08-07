async function updateCollection() {
    console.log("Authenticating as admin...");
    const authRes = await fetch('https://pb.delcargo.us/api/admins/auth-with-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            identity: 'admin@delcargo.com',
            password: 'admin123456'
        })
    });
    
    if (!authRes.ok) {
        console.error("Auth failed:", await authRes.text());
        return;
    }
    
    const { token } = await authRes.json();
    
    console.log("Fetching hr_tickets collection...");
    const colRes = await fetch('https://pb.delcargo.us/api/collections/hr_tickets', {
        headers: { 'Authorization': token }
    });
    const collection = await colRes.json();
    
    const hasField = collection.schema.some(f => f.name === 'department');
    if (hasField) {
        console.log("Department field already exists in hr_tickets!");
        return;
    }
    
    console.log("Adding department field to schema...");
    const newField = {
        system: false,
        id: "ti_department",
        name: "department",
        type: "select",
        required: false,
        presentable: false,
        unique: false,
        options: {
            maxSelect: 1,
            values: ["hr", "technical"]
        }
    };
    
    collection.schema.push(newField);
    
    console.log("Updating collection...");
    const updateRes = await fetch('https://pb.delcargo.us/api/collections/hr_tickets', {
        method: 'PATCH',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(collection)
    });
    
    if (!updateRes.ok) {
        console.error("Update failed:", await updateRes.text());
        return;
    }
    
    console.log("Successfully updated hr_tickets collection!");
}

updateCollection().catch(console.error);

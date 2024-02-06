import fs from 'fs';

const filePath = '/Users/steve/Development/JavaScript/TEALScript_CardPayments/dist/Immersve.arc4.json';

try {
    const data = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(data);

    console.log('Name - Description:');
    /*
    console.log(JSON.stringify(jsonData, null, 2));
    jsonData.forEach((item: any) => {
        console.log(`${item.name} - ${item.desc}`);
    });
    */
   jsonData.methods.forEach((method: any) => {
    console.log(`${method.name}(${method.args.map((arg: any) => arg.type).join(',')})${method.returns.type}`)
    console.log(`${method.desc}`);
    console.log();
   });
} catch (error) {
    console.error('Error reading the file:', error);
}

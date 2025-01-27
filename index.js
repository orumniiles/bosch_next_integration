const dotenv = require('dotenv');
const https = require('https');
const { getSaleslines } = require('./dbProcess');
const { getCustomersInExtra, 
    getProductGroups, 
    createTurnoverObjects,
    bookPoints } = require('./apiBosch')

const defineDotEnvFileName = () => {
    const envArgs = process.argv.slice(2);
    if (envArgs.length === 0) {
        console.warn('No environment file specified. Using default .env file.');
        dotenv.config();
    } else {
        envArgs.forEach((arg) => {
            const envFilePath = `./.env.${arg}`;
            dotenv.config({ path: envFilePath });
        });
    }
};

// Defining if running with prod or dev .env -file
defineDotEnvFileName();

// Defining configurations for making AXIOS-request - depends on .env -file
const getConfig = () => {
    return {
        config: {
            baseURL: process.env.API_BOSCH_URL,
            timeout: process.env.API_BOSCH_TIMEOUT,
            auth: {
                username: process.env.API_BOSCH_USERNAME,
                password: process.env.API_BOSCH_PASSWORD,
            },
            headers: {
                RequestKey: process.env.API_BOSCH_REQUEST_KEY,
                'Content-Type': 'application/json',
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
        },
        options: {
            testMode: process.env.API_BOSCH_TEST_MODE,
            wholesaler: process.env.API_BOSCH_WHOLESALER,
            country: process.env.API_BOSCH_COUNTRY
        }           
        
    };
};

// 0. Creating configuration file for creating AXIOS requests for BOSCH API
const config = getConfig()

const processSaleslines = async () => {
    try {

        // 1. Get customers registered to Bosch Extra
        const customers = await getCustomersInExtra(config);

        // 2. Get saleslines for Bosch-labeled articles from AX for yesterday
        let saleslines = await getSaleslines(
            process.env.ORUM_DATABASE_URL,
            process.env.ORUM_DATABASE_NAME,
            process.env.ORUM_DATABASE_USERNAME,
            process.env.ORUM_DATABASE_PASSWORD
        );

        // 3. Filter saleslines where the customer is registered to Bosch EXTRA
        saleslines = saleslines.filter(line => 
            customers.some(customer => customer.customerId === line.custAccount)
        );

        // 4. Filter saleslines where article is part of Bosch Extra & add Bosch Extra info to lines
        const products = await getProductGroups(config, [...new Set(saleslines.map(line => line.itemId))], process.env.API_BOSCH_COUNTRY)
        
        saleslines = saleslines
            // Filtering saleslines where article can be found from products
            .filter(line => {
            return products.some(product => product.articleNr === line.itemId)   
            })
            // Adding Bosch EXTRA product data to salesline-objects
            .map(line => {
                const found = products.find(product => product.articleNr === line.itemId)
                return {...line, ...found}
            })

        // 5. Create turnovers based on saleslines
        const turnovers = createTurnoverObjects(saleslines, process.env.API_BOSCH_WHOLESALER)
        
        // 6. Send turnovers to Bosch EXTRA and book points
        bookPoints(config, turnovers, process.env.API_BOSCH_COUNTRY, process.env.API_BOSCH_BATCHSIZE)


    } catch (err) {
        console.error("Error processing saleslines:", err);
        throw err;
    }
};

processSaleslines();

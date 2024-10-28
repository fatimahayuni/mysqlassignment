const express = require('express');
const hbs = require('hbs');
const wax = require('wax-on');
require('dotenv').config();
const { createConnection } = require('mysql2/promise');

let app = express();
app.set('view engine', 'hbs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

wax.on(hbs.handlebars);
wax.setLayoutPath('./views/layouts');

// Register custom helpers
hbs.registerHelper('eq', (a, b) => a === b);
hbs.registerHelper('inArray', (array, value) => array.includes(value));


// Initialize the MySQL connection variable
let connection;

// Main async function to set up the database connection and routes
async function main() {
    // Establish the connection to the database
    connection = await createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
    });

    // Set up the /customers route
    app.get('/customers', async (req, res) => {
        const [customers] = await connection.execute(`
            SELECT * FROM Customers 
            INNER JOIN Companies ON Customers.company_id = Companies.company_id
        `);
        res.render('customers/index', {
            customers: customers,
        });
    });

    // Create a route to display a form to add new customer
    app.get('/customers/create', async (req, res) => {
        let [companies] = await connection.execute('SELECT * from Companies');
        console.log("Companies:", companies); // Check the output here

        let [employees] = await connection.execute('SELECT * FROM Employees');
        res.render('customers/create', {
            'companies': companies,
            'employees': employees
        });
    });

    // Processing the form to add a new customer
    app.post('/customers/create', async (req, res) => {
        let { first_name, last_name, rating, company_id, employee_id } = req.body;

        // Insert new customer
        let query = 'INSERT INTO Customers (first_name, last_name, rating, company_id) VALUES (?, ?, ?, ?)';
        let bindings = [first_name, last_name, rating, company_id];
        let [result] = await connection.execute(query, bindings);

        let newCustomerId = result.insertId;

        for (let id of employee_id) {
            let query = 'INSERT INTO EmployeeCustomer (employee_id, customer_id) VALUES (?, ?)';
            let bindings = [id, newCustomerId];
            await connection.execute(query, bindings);
        }
        res.redirect('/customers');
    })

    // Display a form to update a specific customer
    app.get('/customers/:customer_id/edit', async (req, res) => {
        let [companies] = await connection.execute('SELECT * from Companies');
        let [employees] = await connection.execute('SELECT * from Employees');
        let [customers] = await connection.execute('SELECT * from Customers WHERE customer_id = ?', [req.params.customer_id]);
        let [employeeCustomers] = await connection.execute('SELECT * from EmployeeCustomer WHERE customer_id = ?', [req.params.customer_id]);

        let customer = customers[0];
        let relatedEmployees = employeeCustomers.map(ec => ec.employee_id);

        res.render('customers/edit', {
            customer: customer,
            companies: companies,
            employees: employees,
            relatedEmployees: relatedEmployees,
            customer_id: req.params.customer_id
        });
    });

    app.post('/customers/:customer_id/edit', async (req, res) => {
        let { first_name, last_name, rating, company_id, 'employee_id[]': employee_ids } = req.body;
        console.log("req.body:", req.body);
        console.log("Company_id: ", company_id)

        // Update customer details
        let query = 'UPDATE Customers SET first_name=?, last_name=?, rating=?, company_id=? WHERE customer_id=?';
        console.log("query", query);
        let bindings = [first_name, last_name, rating, company_id, req.params.customer_id];
        console.log("bindings", bindings);
        await connection.execute(query, bindings);

        // Delete existing EmployeeCustomer entries for this customer
        await connection.execute('DELETE FROM EmployeeCustomer WHERE customer_id = ?', [req.params.customer_id]);

        // Check if employee_ids is an array
        if (Array.isArray(employee_ids)) {
            for (let id of employee_ids) {
                let query = 'INSERT INTO EmployeeCustomer (employee_id, customer_id) VALUES (?, ?)';
                let bindings = [id, req.params.customer_id];
                await connection.execute(query, bindings);
            }
        } else if (employee_ids) {
            // If only one employee_id is selected (not as an array)
            let query = 'INSERT INTO EmployeeCustomer (employee_id, customer_id) VALUES (?, ?)';
            let bindings = [employee_ids, req.params.customer_id];
            await connection.execute(query, bindings);
        }

        res.redirect('/customers');
    });

    app.get('/customers/:customer_id/delete', async function (req, res) {
        // display a confirmation form
        const [customers] = await connection.execute(
            "SELECT * FROM Customers WHERE customer_id =?", [req.params.customer_id]
        );
        console.log("customers", customers);
        const customer = customers[0];

        res.render('customers/delete',
            { customer })
    });

    app.post('/customers/:customer_id/delete', async function (req, res) {

        // Delete all related sales entries first
        await connection.execute(`DELETE FROM Sales WHERE customer_id = ?`, [req.params.customer_id]);

        // Delete relationship in EmployeeCustomer
        await connection.execute(`DELETE FROM EmployeeCustomer WHERE customer_id = ?`, [req.params.customer_id]);

        // Delete the customer in Customers
        await connection.execute(`DELETE FROM Customers WHERE customer_id = ?`, [req.params.customer_id]);
        res.redirect('/customers');
    })


    // Start the server
    app.listen(3000, () => {
        console.log('Server is running on http://localhost:3000');
    });
}

// Call the main function to run the app
main();

const express = require("express")
const path = require("path")
const {open} = require("sqlite")
const sqlite3 = require("sqlite3")

const dotenv = require("dotenv")
dotenv.config()

const cors = require("cors")

const bcrypt = require("bcrypt")

const jwt = require("jsonwebtoken")

var validator = require("validator")
var moment = require("moment")
const { request } = require("http")

const app = express()
app.use(express.json())
app.use(cors())

const dbPath = path.join(__dirname,"credit.db")
let db = null;

let port = process.env.port

//connecting to Database and starting server on Port 3000
const initializeDbAndServer = async () => {
 try {
  db = await open({
   filename: dbPath,
   driver: sqlite3.Database
  })
  app.listen(port,() => {
    console.log("Server Running Successfully at http://localhost:3000/")
  })
 }
 catch(e){
  console.log(`DB Error: ${e.message}`)
  process.exit(1)
 }
}

initializeDbAndServer()

//Register ApI 
app.post("/register", async (request,response) => {
 const {username,password,email} = request.body
 const hashedPassword = await bcrypt.hash(request.body.password,10)
 const selectUserQuery = `
 SELECT * 
 FROM user 
 WHERE email = '${email}'
 `;
 const dbUser = await db.get(selectUserQuery)
 if (dbUser === undefined){
  const createUserQuery = `
  INSERT INTO 
    user (username,password,email) 
  VALUES 
    (
      '${username}',
      '${hashedPassword}', 
      '${email}'

    )`;
const dbResponse = await db.run(createUserQuery);
const newUserId = dbResponse.lastID;
response.send(`Created new user with ${newUserId}`);
 }
 else {
  response.status = 400;
  response.send("User Already Exists")
 }
})


//Login API 
app.post("/login",async (request,response) => {
  const {email,password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE email = '${email}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid User");
  } else {
    const isPasswordMatched = await bcrypt.compare(password,dbUser.password) 
    if (isPasswordMatched === true) {
      const payload = {
        email: email,
      };
      let jwtSecretKey = process.env.jWT_SECRET_KEY
      const jwtToken = jwt.sign(payload, jwtSecretKey);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  
  }
    
})

//Authenticate MiddleWare
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    let jwtSecretKey = process.env.jWT_SECRET_KEY
    jwt.verify(jwtToken, jwtSecretKey, async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//Validate data 
const validateCustomerData = (request,response,next) => {
  const {name,phone,trustScore,address,creditLimit} = request.body 
  const {id} = request.params
  if (name !== undefined){
    if (name !== ''){
      request.name = name
    }else {
      response.status(400)
      response.send("Invalid Name")
      return 
    }
  }
  if (address !== undefined){
    if (address !== ''){
      request.address = address
    }else {
      response.status(400)
      response.send("Invalid Address")
    }
  }
  if (creditLimit !== undefined){
    if (typeof(creditLimit) === typeof(30)){
      request.creditLimit = creditLimit
    }else{
      response.satus(400)
      response.send("Invalid Credit Limit")
    }
  }
  if (phone !== undefined){
    const validatePhone = validator.isMobilePhone(phone)
    if (validatePhone === true){
      request.phone = phone
    } else {
      response.status(400)
      response.send("Invalid Phone Number")
      return
    }
  }
  if (trustScore !== undefined){
    const validateTrustScore = validator.isInt(trustScore,{min:0,max:10})
    if (validateTrustScore === true){
      request.trustScore = trustScore
    }else{
      response.status(400)
      response.send("Invalid Trust Score")
      return
    }
  }
  request.id = id 
  next()
}


//ADD Customer API 
app.post("/creditKhaata/customer",authenticateToken,validateCustomerData, async (request,response) => {
  const {name,trustScore,phone,address,creditLimit} = request
  const addCustomerQuery = `
  INSERT INTO customer (name,trust_score,phone,address,credit_limit)
  VALUES ('${name}','${trustScore}','${phone}','${address}',${creditLimit})
  `;
  const dbResponse = await db.run(addCustomerQuery)
  const customerId = dbResponse.lastID
  response.send({id: customerId})
})

//GET Customers API
app.get("/creditKhaata/customer",authenticateToken,async(request,response)=> {
  const getCustomersQuery = `
  SELECT * 
  FROM customer
  ORDER BY id 
  `;
  const customersArray = await db.all(getCustomersQuery)
  response.send(customersArray)
})

//Update customers Data 
app.put("/creditkhaata/customer/:id",authenticateToken,validateCustomerData,async(request,response) => {
  const {id} = request
  let updateCustomerQuery = null
  const {name,phone,address,creditLimit,trustScore} = request
  switch (true) {
    case phone !== undefined:
     updateCustomerQuery = `
     UPDATE customer 
     SET 
     phone = '${phone}'
     WHERE id = ${id};`
      await db.run(updateCustomerQuery)
      response.send('Phone Number Updated')
      break
    case address !== undefined:
    updateCustomerQuery = `
    update customer 
    SET 
    address = '${address}'
    WHERE id = ${id};
    ` ;
    await db.run(updateCustomerQuery)
    response.send('Address Updated')
    break
    case creditLimit !== undefined:
      updateCustomerQuery = `
    update customer 
    SET 
    credit_limit = '${creditLimit}'
    WHERE id = ${id};
    ` ;
    await db.run(updateCustomerQuery)
    response.send('Credit Limit Updated')
    break
    case trustScore !== undefined:
      updateCustomerQuery = `
    update customer 
    SET 
    trust_score = '${trustScore}'
    WHERE id = ${id};
    ` ;
    await db.run(updateCustomerQuery)
    response.send('Trust Score Updated')
    break
    case name !== undefined:
      updateCustomerQuery = `
    update customer 
    SET 
    name = '${name}'
    WHERE id = ${id};
    ` ;
    await db.run(updateCustomerQuery)
    response.send('Name Updated')
    break
  }
  })


// delete Customers Data 
app.delete("/creditkhaata/customer/:id",authenticateToken,async (request,response) => {
  const {id} = request.params 
  const deleteCustomerQuery = `
  DELETE FROM 
  customer 
  WHERE id = ${id}
  `;
  await db.run(deleteCustomerQuery)
  response.send("Customer Deleted Successfully")
})


//Validate Loan Data 
const validateLoanData = (request,response,next) => {
  const {customerId,itemDescription,issueDate,dueDate,frequency,loanStatus,loanAmount} = request.body 
  const {loanId} = request.params 
  if (issueDate !== undefined){
    const isValidDate = moment(issueDate,"YYYY-MM-DD").isValid()
    if (isValidDate){
      request.issueDate = issueDate
    }
    else {
      response.status(400)
      response.send("Invalid Issue Date")
      return 
    }
  }
  if (loanAmount !== undefined){
    if (typeof(loanAmount) === typeof(60)){
      request.loanAmount = loanAmount 
    }else {
      response.status(400)
      response.send("Invalid Loan Amount")
      return 
    }
  }
  if (customerId !== undefined){
    if (customerId !== ''){
       request.customerId = customerId
    }else {
      response.status(400)
      response.send("Invalid Customer Id")
      return 
    }
  }
  if (itemDescription !== undefined){
    if (itemDescription !== ''){
      request.itemDescription = itemDescription
    }else {
      response.status(400)
      response.send("Invalid Item Description")
      return 
    }
  }
  if (dueDate !== undefined){
    const isValidDate = moment(dueDate,"YYYY-MM-DD").isValid()
    if (isValidDate){
      request.dueDate = dueDate
    }
    else {
      response.status(400)
      response.send("Invalid Due Date")
      return 
    }
  }
  if (frequency !== undefined){
     const frequencyArray = ["bi-weekly","monthly"]
     const isFrequency = frequencyArray.includes(frequency)
     if (isFrequency){
      request.frequency = frequency
     }
     else {
      response.satus(400)
      response.send("Invalid Frequency")
      return
     }

  }
  if (loanStatus !== undefined){
    const loanStatusArray = ["pending","paid","overdue"]
    const isLoanStatus = loanStatusArray.includes(loanStatus)
    if (isLoanStatus){
      request.loanStatus = loanStatus
    }else{
      response.satus(400)
      response.send("Invalid Loan Status")
      return 
    }
  }
 request.loanId = loanId 
 next()
}


//adding loan API 
app.post("/creditkhaata/loan",validateLoanData,async (request,response) => {
  const {customerId,itemDescription,loanAmount,issueDate,dueDate,frequency,loanStatus} = request
  const createCreditQuery = `
  INSERT INTO loan(customer_id,item_description,loan_amount,issue_date,due_date,frequency,loan_status)
  VALUES (${customerId},'${itemDescription}',${loanAmount},'${issueDate}','${dueDate}','${frequency}','${loanStatus}')
  `;
  const dbResponse = await db.run(createCreditQuery)
  response.send("Credit Added Successfully")
})


//View all loans 
app.get("/creditkhaata/loan",async (request,response) => {
  const getLoansQuery = `
  SELECT * 
  FROM loan 
  `;
  const loansArray = await db.all(getLoansQuery)
  response.send(loansArray)
})

module.exports = app


const express = require('express');
const { signToken } = require('./../controllers/authController');
const User = require('./../Models/userModel'); // <-- import the User model
const authController = require('./../controllers/authController');
const asyncErrorHandler = require('./../utils/asyncErrorHandler');
const jwt = require('jsonwebtoken');


const router = express.Router();

router.post('/signup', asyncErrorHandler(async (req, res, next) => {


    try {
        const newUser = await User.create(req.body);
        const token = signToken(newUser._id);


        res.status(201).json({ status: 'success', data: newUser });
    } catch (err) {
        if (err.code === 11000) {
            // Mongo duplicate key error
            return res.status(400).json({
                status: 'fail',
                message: 'Email already exists'
            });
        }
        next(err);
    }
}));

// router.get('/', (req, res) => {
//     res.render('home', { title: '🎬 Frequency ENT - Movies' });
// });


router.route('/login').post(authController.login);


// Show login page
router.get('/login', (req, res, next) => {
    return res.render('login', {
        title: 'Login',
        activePage: 'login',
        user: req.user || null,
        genres: []
    });
})




router.route('/forgotPassword').post(authController.forgotPassword);
router.route('/resetPassword/:token').patch(authController.resetPassword);



// router.route('/signup').post(authController.signup);

module.exports = router;















// const express = require('express')
// const fs = require('fs')
// const authController = require('./../controllers/authController');
// const asyncErrorHandler = require('./../utils/asyncErrorHandler');
//
// const router = express.Router();
//
// router.post(
//     '/signup',
//     asyncErrorHandler(async (req, res) => {
//         const user = await User.create(req.body);
//         res.status(201).json({ status: 'success', data: user });
//     })
// );
// // router.route('/signup').post(authController.signup);
//
// module.exports = router;
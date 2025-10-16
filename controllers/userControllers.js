// controllers/userController.js
const User = require('./../Models/userModel');
const asyncErrorHandler = require('./../utils/asyncErrorHandler');
const customError = require('./../utils/CustomError');
const { signToken } = require('./authController'); // reuse function


exports.getAllUsers = asyncErrorHandler(async (req,res,next) =>{
    const users = await User.find();

    res.status(200).json({
        status: 'success',
        result:users.length,
        data: users
    });

})

exports.filterObj = (obj, ...allowedFields) =>{
    const newObj = {};
    Object.keys(obj).forEach(prop =>{
        if (allowedFields.includes(prop))
            newObj[prop] = obj[prop]
    })

    return newObj;
}



// Update password (authenticated user only)
exports.updatePassword = asyncErrorHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id).select('+password');

    // 1. Check if current password matches
    if (!(await user.comparePasswordInDb(req.body.currentPassword))) {
        return next(new customError('Your current password is incorrect', 401));
    }

    // 2. Update password
    user.password = req.body.password;
    user.confirmPassword = req.body.confirmPassword;
    await user.save();

    // 3. Issue new JWT
    const token = signToken(user.id);

    res.status(200).json({
        status: 'success',
        token,
        data: { user }
    });


});

// Example: update profile info (name, email, etc.)
// exports.updateMe = asyncErrorHandler(async (req, res, next) => {
//     const updatedUser = await User.findByIdAndUpdate(
//         req.user._id,
//         { name: req.body.name, email: req.body.email },
//         { new: true, runValidators: true }
//     );
//
//     res.status(200).json({
//         status: 'success',
//         data: { user: updatedUser }
//     });
// });

exports.updateMe = asyncErrorHandler(async (req,res,next) =>{
if (req.body.password || req.body.confirmPassword){
    return next(new customError('You can not update your password using this end point', 400))
}

//UPDATE USER DETAILS
    const filteredBody = exports.filterObj(req.body, 'name', 'email', 'photo');
    const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {runValidators: true, new:true});

    res.status(200).json({
        status: 'success',
        data:{
            user:updatedUser
        }
    });


})
exports.deleteMe = asyncErrorHandler(async (req,res,next) =>{
    await User.findByIdAndUpdate(req.user.id, {active:false});

    res.status(204).json({
        status: 'success',
        data: null
    });
})





// const util = require("util");
// const jwt = require("jsonwebtoken");
//
// const customError = require("./../utils/CustomError");
//
// const sendEmail = require('./../utils/email');
// const crypto = require("crypto");
// const {use} = require("express/lib/application");
//
// const asyncErrorHandler = require("../utils/asyncErrorHandler");
// const User = require("../Models/userModel");
// const customError = require("../utils/CustomError");
//
//
//
//
// exports.updatePassword = asyncErrorHandler(async (req,res,next) =>{
// //GET CURRENT USER DATA FROM DB
//     const user = await User.findById(req.user._id).select('+password');
//
//     // CHECK IF THE GIVEN PASSWORD IS  CURRENT
//     if ((!await user.comparePassword(req.body.currentPassword, user.password))){
//         return next(new customError('The current password you provided is invalid', 401))
//
//     }
//     //IF THE USER DATA IS CORRECT UPDATE PASSWORD WITH THE NEW VALUE
//     user.password = req.body.password;
//     user.confirmPassword = req.body.confirmPassword;
//     await user.save();
//
//     // LOGIN USER AND SEND JWT
//     createSendResponse(user,200,res);
//     const token = signToken(user._id);
//
//
// })

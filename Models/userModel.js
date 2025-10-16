// models/userModel.js
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require("crypto");

// Define schema first
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters long'],
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true,
        unique: true, // index
        validate: {
            validator: (val) => validator.isEmail(val),
            message: 'Please enter a valid email address'
        }
    },
    role:{
        type:String,
        enum: ['user', 'admin'],
        default : 'user'
    },



    phone: {
        type: String,
        validate: {
            validator: (value) => !value || validator.isMobilePhone(value, 'any'),
            message: 'Please enter a valid phone number',
        },
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select:false

    },
    confirmPassword:{
         type: String,
         required:[true, 'please enter a valid password'],
        validate:{
             validator:function (val){
                 return val === this.password;
             }
        },
        select:false
     },
    active :{
      type:Boolean,
        default: true,
        select:false
    },
    passwordChangedAt : {
        type: Date,
        select: false
    },
    passwordResetToken: String,
    passwordResetExpires: Date,
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date
    }

});

/// Hash password & set passwordChangedAt if needed
userSchema.pre('save', async function (next) {
    // Only run if password was actually modified
    if (!this.isModified('password') || this.isNew) return next();



    // Hash the password
    this.password = await bcrypt.hash(this.password, 12);

    // Remove confirmPassword field
    this.confirmPassword = undefined;

    // If not a new doc → update passwordChangedAt

});

// Set passwordChangedAt if password was modified (and not new)
userSchema.pre('save', function(next) {
    if (!this.isNew && this.isModified('password')) {
        this.passwordChangedAt = Date.now() - 1000;
    }
    next();
});
// running before find
userSchema.pre(/^find/, async function(next){

    this.find({active: {$ne: false}});
    next();
})

// 🔑 Compare input password with DB hash
userSchema.methods.comparePasswordInDb = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.virtual('isLocked').get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// 🔑 Check if user changed password after JWT was issued
userSchema.methods.isPasswordChanged = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);

        return JWTTimestamp < changedTimestamp;
    }
    return false;
};
//PASSWORD RESET FANCTION

userSchema.methods.createPasswordResetToken = function () {
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Save encrypted version in DB
    this.passwordResetToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    // Token expiry (10 mins)
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

    return resetToken; // return plain token to send via email (or response for now)
};





// Create and export model
const User = mongoose.models.User || mongoose.model('User', userSchema);



// const User = mongoose.model('User', userSchema);
module.exports = User;










// const mongoose = require('mongoose');
// const fs = require('fs');
//
// const validator = require('validator');
//
// const userSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required:[true, 'please enter your name']
//     },
//     email:{
//         type: String,
//         unique:true,
//         lowercase: true,
//         validate:[validator.isEmail(), 'please enter a valid email']
//     },
//     photo: String,
//     password: {
//         type: String,
//         required:true,
//         minLength: 8,
//     },
//     confirmPassword:{
//         type: String,
//         required:[true, 'please enter a valid password']
//     },
//     userName:{
//         type: String,
//         required: true,
//         unique: true
//     }
// })
//
// const ser = mongoose.model(user,userSchema)
//
// module.exports = user;
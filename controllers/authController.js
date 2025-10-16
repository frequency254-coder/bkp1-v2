const util = require("util");
const jwt = require("jsonwebtoken");
const User = require("./../Models/userModel");
const customError = require("./../utils/CustomError");
const asyncErrorHandler = require("./../utils/asyncErrorHandler");
const sendEmail = require('./../utils/email');
const Cookies = require('cookies')

const crypto = require("crypto");
const {use} = require("express/lib/application");


const signToken = id => {
    return jwt.sign({ id }, process.env.SECRET_STR, {
        expiresIn: process.env.JWT_EXPIRES_IN
    });
};






// const signToken = id=>{
//       return jwt.sign({ id }, process.env.SECRET_STR, {
//             expiresIn:process.env.LOGIN_EXPIRES
//       })
// }



const createSendResponse = (user, statusCode, req, res) => {
      const token = signToken(user._id);

      const options = {
            maxAge: Number(process.env.COOKIE_EXPIRES), // in ms
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
      };

      // Set the cookie BEFORE sending the response
      res.cookie('jwt', token, options);

      // If you want to use Cookies library, also set it BEFORE res.json
      const keys = ['keyboard cat'];
      const cookies = new Cookies(req, res, { keys: keys });
      cookies.set('auth', token, options);

      // Hide password before sending user
      user.password = undefined;

      // Send response
      res.status(statusCode).json({
            status: 'success',
            token,
            data: { user },
      });
};

// const createSendResponse = (user,statusCode,req,res) =>{
//       const token = signToken(user._id);
//
//       const options = {
//             maxAge: process.env.LOGIN_EXPIRES,
//             secure: true,
//             httpOnly:true
//       }
//
//       if (process.env.NODE_ENV === 'production') {
//             options.secure = true
//       }
//
//       res.cookie('jwt', token, options)
//       // user.password = undefined;
//       user.password = undefined;
//
//
//
//       res.status(statusCode).json({
//             status: 'success',
//             token,
//             data: {
//                   user
//             }
//       });
//
//       // Optionally define keys to sign cookie values
//       // to prevent client tampering
//       const keys = ['keyboard cat'];
//       const cookies = new Cookies(req, res, { keys: keys })
//       cookies.set('auth', token,{})
//
// }

exports.signup =asyncErrorHandler(async (req,res, next) =>{
      const newUser = await User.create(req.body);

      createSendResponse(newUser,201,req,res);
      //ADDED FROM ANOTHER CODE

})


exports.login =asyncErrorHandler(async (req,res,next) =>{

      const {email,password} = req.body;

      if (!email || !password){
            return next(new customError('please provide email ID and Password for login!', 400));
      }

      const  user = await User.findOne({email}).select('+password +loginAttempts +lockUntil');

      // const isMatch = await user.correctPassword(password, user.password)
      // if (!user || !(await user.comparePasswordInDb(password, user.password))){
      //       return next(new customError('please provide email ID and Password for login!', 400));
      // }

      // 3. If account is locked
      if (user.lockUntil && user.lockUntil > Date.now()) {
            return next(new customError('Account is locked. Try again later.', 423));
      }

      // 4. Compare password
      const isMatch = await user.comparePasswordInDb(password);
      if (!isMatch) {
            user.loginAttempts += 1;

            // Lock if more than 5 attempts
            if (user.loginAttempts >= 5) {
                  user.lockUntil = Date.now() + 60 * 60 * 1000; // 60 min lock
            }

            await user.save({ validateBeforeSave: false });
            return next(new customError('Invalid email or password', 401));
      }

      // 5. If success → reset attempts
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save({ validateBeforeSave: false });

      // 6. Send token
      createSendResponse(user,200,req,res);





});





exports.protect = asyncErrorHandler(async (req, res, next) => {
      // 1. READ TOKEN FROM HEADERS
      const authHeader = req.headers.authorization;
      let token;

      if (authHeader && authHeader.toLowerCase().startsWith("bearer")) {
            token = authHeader.split(" ")[1];
      }

      // 2. CHECK IF TOKEN EXISTS
      if (!token) {
            return next(new customError("You are not logged in. Please log in!", 401));
      }

      // 3. VERIFY TOKEN
      const decoded = await util.promisify(jwt.verify)(token, process.env.SECRET_STR);
      // decoded contains { id, iat, exp }

      // 4. CHECK IF USER STILL EXISTS
      const user = await User.findById(decoded.id);
      if (!user) {
            return next(new customError("The user with the given token no longer exists", 401));
      }

            // 5. CHECK IF USER CHANGED PASSWORD AFTER TOKEN WAS ISSUED
      const isPasswordChanged = await user.isPasswordChanged(decoded.iat)

      if (isPasswordChanged) {
            console.log("⛔ Token invalid: password was changed after token issued");
            return next(new customError("Password was changed recently. Please log in again.", 401));
      }

      // 6. ATTACH USER TO REQUEST (for later use)
      req.user = user;


      next();
});

exports.restrict = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(new customError('You do not have permission to perform this action', 403));
        }
        next();
    };
};


// FORGOT PASSWORD
exports.forgotPassword = asyncErrorHandler(async (req, res, next) => {
      // 1. Find user by email
      const user = await User.findOne({ email: req.body.email });

      if (!user) {
            return next(new customError("No user found with that email", 404));
      }

      // 2. Generate reset token (plain + hashed)
      const resetToken = user.createPasswordResetToken();
      await user.save({ validateBeforeSave: false });

      // 3. Build reset URL
      const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/users/resetPassword/${resetToken}`;

      // 4. Define email message
      const message = `Forgot your password? Submit a PATCH request with your new password and confirmPassword to: ${resetUrl}\n\nIf you didn't forget your password, please ignore this email.`;

      try {
            // 5. Send email
            await sendEmail({
                  email: user.email,
                  subject: "Your password reset token (valid for 10 min)",
                  message,
            });

            res.status(200).json({
                  status: "success",
                  message: "Token sent to email!",
            });

      } catch (err) {
            // In case email fails, clean up token fields
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save({ validateBeforeSave: false });

            return next(new customError("There was an error sending the email. Try again later!", 500));
      }
});


// RESET PASSWORD
exports.resetPassword = asyncErrorHandler(async (req, res, next) => {
      console.log("Request body:", req.body);


      // 1. Hash token from request params
      const hashedToken = crypto
          .createHash("sha256")
          .update(req.params.token)
          .digest("hex");

      // 2. Find user by token & check expiry
      const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
      });

      if (!user) {
            return next(new customError("Token is invalid or has expired", 400));
      }

      // 3. Set new password
      user.password = req.body.password;
      user.confirmPassword = req.body.confirmPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      user.passwordChangedAt =Date.now();



      await user.save();

      // 4. Log user in again (send JWT)
      createSendResponse(user,200,req,res);


});






// exports.protect = asyncErrorHandler(async(req,res,next) =>{
//       //READ THE TOKEN & CHECK IF EXIST
//       const testToken = req.headers.authorization;
//      let token;
//
//       if (testToken && testToken.startsWith('bearer')){
//             token = testToken.split(' ')[1];
//       }
//       console.log(token);
//
//       //VALIDATE TOKEN
//
//
//       //UF THE  USER EXIST
//
//       // IF THE USER CHANGED  PASSWORD AFTER TOKEN WAS ISSUED
//
//
//       //ALLOW ACCESS
//       next()
//
// })
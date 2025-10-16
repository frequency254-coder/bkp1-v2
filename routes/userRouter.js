const express = require('express');
const authController = require("./../controllers/authController");
const userController = require('./../controllers/userControllers');

const router = express.Router();


router.get(
    '/getAllUsers',
        authController.protect,
        userController.getAllUsers
);


router.patch(
    '/updatePassword',
    authController.protect,
    userController.updatePassword
);

router.patch(
    '/updateMe',
    authController.protect,
    userController.updateMe
);

router.delete(
    '/deleteMe',
    authController.protect,
    userController.deleteMe
);

module.exports = router;








// const express = require('express');
//
// const router = express.Router();
//
// const authController = require("../controllers/authController");
// const userController = require('./../controllers/userControllers');
//
//
// router.route('/updatePassword').patch(
//     authController.protect,
//     userController.updatePassword
// );
//
// module.exports = router;
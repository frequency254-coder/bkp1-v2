const mongoose = require('mongoose');
const fs = require('fs');
const validator = require('validator');

// Original movie schema
const movieSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'name is a required field'],
        maxLength: [100, `Movie name can't exceed 100 characters`],
        minLength: [3, `Movie name must have at least 3 characters`],
        unique: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },

    duration: {
        type: Number,
        // required: [true, 'duration is a required field'] // ⚠️ Optional, comment is fine
    },

    ratings: {
        type: Number,
        validate: {
            validator: function (value) {
                return value >= 1 && value <= 10;
            }
        }
    },

    releaseYear: {
        type: Number
    },
    releaseDate: {
        type: Date
    },
    totalRatings: {
        type: Number
    },
    createdAt: {
        type: Date,
        default: Date.now()
    },
    id: { type: Number }, // ⚠️ MongoDB already gives _id; keep only if necessary

    overview: String,
    poster_path: String,
    trailer: String,

    genres: [{
        type: String,
        // enum was missing in your last version
        enum: ["Adventure", "Action", "Sci-fi", "Thriller", "Crime", "War",
            "Drama", "Comedy", "Romance", "Biography", "Animation", "Anime", "History"],
        required: true
    }],

    coverImage: {
        type: String,
        required: [true, 'Cover image is required']
    },

    actors: {
        type: [String]
    },

    // ⚠️ Removed commented out fields like episodes, seasons, etc. if not used
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual field
movieSchema.virtual('durationInHours').get(function () {
    return this.duration ? this.duration / 60 : null; // ✅ Added null check
});

// Mongoose middleware

// Pre-save
movieSchema.pre('save', function (next) {
    this.createdBy = 'FREQUENCY'; // ✅ Added createdBy
    next();
});

// Post-save
movieSchema.post('save', function (doc, next) {
    const content = `A new movie document with the name ${doc.title} has been created by ${doc.createdBy}\n`;
    fs.appendFile('./log/log.txt', content, { flag: 'a' });
    next();
});

// Pre-find
movieSchema.pre(/^find/, function (next) {
    const filter = this.getFilter();

    // ✅ Only add releaseDate filter if field exists
    if (!filter.releaseDate) {
        this.find({ ...filter, $or: [{ releaseDate: { $exists: false } }, { releaseDate: { $lte: new Date() } }] });
    }


    this.startTime = new Date(); // ✅ Measure query start time
    next();
});

// Post-find
movieSchema.post(/^find/, function (docs, next) {
    this.endTime = new Date();
    const content = `Query took ${this.endTime - this.startTime} ms to fetch ${docs.length} documents.\n`;
    fs.writeFileSync('./log/log.txt', content, { flag: 'a' });
    next();
});

// Pre-aggregate
movieSchema.pre('aggregate', function (next) {
    // ⚠️ Added: ensures only movies released up to current year are returned
    this.pipeline().unshift({ $match: { releaseYear: { $lte: new Date().getFullYear() } } });
    next();
});

const Movie = mongoose.model('movie', movieSchema);
module.exports = Movie;




















// const mongoose = require('mongoose');
// const fs = require('fs');
// const validator = require('validator');
//
// // import mongoose from "mongoose";
//
// const  movieSchema = new mongoose.Schema({
//     title :{
//         type : String,
//         required : [true, 'name is a required field'],
//         maxLength : [100, `Movie name can't exceed 100 characters`],
//         minLength : [3, `Movie name must have at least 3 characters`],
//         unique : true,
//         trim: true
//     },
//     description : {
//         type : String,
//         trim: true
//
//     },
//
//     duration :{
//         type : Number,
//         // required:[ true, ' duration is a  required field']
//     },
//     ratings : {
//         type : Number,
//         validate :{
//             validator:function(value){
//                 return value >= 1 && value  <= 10;
// }
//         }
//
//     },
//     releaseYear : {
//         type : Number
//     },
//         releaseDate: {
//         type:Date
//         },
//     totalRatings : {
//         type: Number
//     },
//     createdAt :{
//         type :  Date,
//         default: Date.now()
//     },
//         id: { type: Number },
//
//         overview: String,
//
//
//         poster_path: String,
//         trailer: String,
//         genres: [{
//             type: String,
//
//             required: true
//         }],
//
//
//
//         coverImage : {
//         type : String,
//
//     },
//     actors : {
//         type : [String]
//     },
//
//
// },
//     {
//     toJSON: {virtuals:true},
//     toObject: {virtuals:true}
//
// });
//
//     movieSchema.virtual('durationInHours').get(function (){
//     return this.duration/60;
// })
// //mongo midle ware
// //BEFORE ,SAVE/ .CREATE
//     movieSchema.pre('save', function (next){
//     this.createdBy = 'FREQUENCY';
//         next();
//     })
// movieSchema.post('save', function (doc,next){
//     const content = `A new movie document with the name ${doc.title} has been created by ${doc.createdBy}\n`;
//         fs.writeFileSync('./log/log.txt' , content, {flag: 'a'}, (err)=>{
//             console.log(err.message);
//         });
//     next();
// });
// movieSchema.pre(/^find/, function (next) {
//     // 1. Get the current query conditions
//     const filter = this.getFilter();
//
//     // 2. Add your new condition to existing filters
//     this.find({
//         ...filter,  // Preserve existing filters
//         releaseDate: {
//             ...filter.releaseDate, // Preserve existing date filters
//             $lte: new Date()      // Add new condition
//         }
//     });
//     this.startTime = new Date()
//
//     next();
// });
// // movieSchema.post(/^find/, function (doc,next) {
// //     // Add condition without overwriting existing query
// //     this.where('releaseDate').lte(new Date());
// //     this.endTime = new Date()
// //
// //     const content =`Query took ${this.endTime - this.startTime} milliseconds to fetch the document.`;
// //     fs.writeFileSync('./log/log.txt' , content, {flag: 'a'}, (err)=>{
// //         console.log(err.message);
// //     });
// //
// //     next();
// // });
//
// movieSchema.pre('aggregate',function (next){
//     this.pipeline().unshift({ $match: { releaseYear: { $lte: new Date().getFullYear() } } });
//
//     next();
// })
//
// const Movie = mongoose.model('movie', movieSchema);
//
//
// module.exports = Movie;
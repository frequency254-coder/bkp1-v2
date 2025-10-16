const Movie = require("../Models/movieModel");

class ApiFeatures{
    constructor(query, queryStr) {
        this.query = query;
        this.queryStr = queryStr;

    }
    filter(){
        // 1. Create a copy of req.query
        const queryObj = { ...this.queryStr };

        // 2. Remove reserved parameters from filter
        const excludedFields = ['sort', 'page', 'limit', 'fields', 't'];
        excludedFields.forEach(field => delete queryObj[field]);

        // 3. Convert remaining query to string for operator replacement
        let queryStr = JSON.stringify(queryObj);
        queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);

        // 4. Parse back to object for MongoDB
        const filterObj = JSON.parse(queryStr);

//case-insensitive regex handling for genres

        // 🎯 Normalize: support both ?genre= and ?genres=
        const genreParam = this.queryStr.genre || this.queryStr.genres;
        if (genreParam && genreParam !== "all") {
            const genresArr = genreParam.split(',').map(g => g.trim()).filter(Boolean);

            if (genresArr.length) {
                filterObj.$or = [
                    { genres: { $in: genresArr.map(g => new RegExp(`^${g}$`, 'i')) } },
                    { genre: { $in: genresArr.map(g => new RegExp(`^${g}$`, 'i')) } }
                ];
            }
            delete filterObj.genre;
            delete filterObj.genres;
        }

        // 5. Build final query
        this.query = this.query.find({ ...this.query.getQuery(), ...filterObj });

        return this;
    }



    //     if (this.queryStr.genres) {
    //         const genresArr = this.queryStr.genres.split(',').map(g => g.trim()).filter(g => g);
    //         // filterObj.genres = { $in: genresArr.map(g => new RegExp('^' + g + '$', 'i')) };
    //         if (genresArr.length) {
    //             filterObj.$or = [
    //                 { genres: { $in: genresArr.map(g => new RegExp('^' + g + '$', 'i')) } },
    //                 { genre: { $in: genresArr.map(g => new RegExp('^' + g + '$', 'i')) } }
    //             ];
    //         }
    //         delete filterObj.genres; // remove original to avoid conflict
    //     }
    //
    //
    //     // 5. BUILD QUERY (using filterObj, not queryObj)
    //     this.query = this.query.find({ ...this.query.getQuery(), ...filterObj });
    //
    //     return this;
    // }
    sort(){
        // 6. SORTING (using original req.query.sort)
        if (this.queryStr.sort) {
            const sortBy = this.queryStr.sort.split(',').join(' ');
            this.query = this.query.sort(sortBy);
        }else {
            this.query = this.query.sort('name');
        }

        return this;
    }

    limitFields(){
        // limiting fields

        if (this.queryStr.fields){

            // query.select('name' 'description')
            const fields = this.queryStr.fields.split(',').join(' ');
            this.query = this.query.select(fields);
        }else {
            //exclude
            this.query = this.query.select('-__v');
        }

        return this;
    }

    paginate(){
        //pagination
        const page = this.queryStr.page*1 || 1;
        const limit = this.queryStr.limit*1 || 12;
        const skip = (page -1) * limit;
        this.query = this.query.skip(skip).limit(limit);

       this.skip = skip; // store skip to use outside later
        this.limit = limit;  //store limit to use outside later

        return this;
    }

}
module.exports = ApiFeatures;
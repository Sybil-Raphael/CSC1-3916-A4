require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');
const authJwtController = require('./auth_jwt'); // You're not using authController, consider removing it
const jwt = require('jsonwebtoken');
const cors = require('cors');
const User = require('./Users');
const Movie = require('./Movies'); 
 
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
 
app.use(passport.initialize());
 
const router = express.Router();
 
// Removed getJSONObjectForMovieRequirement as it's not used
 
router.post('/signup', async (req, res) => { // Use async/await
  if (!req.body.username || !req.body.password) {
    return res.status(400).json({ success: false, msg: 'Please include both username and password to signup.' }); // 400 Bad Request
  }
 
  try {
    const user = new User({ // Create user directly with the data
      name: req.body.name,
      username: req.body.username,
      password: req.body.password,
    });
 
    await user.save(); // Use await with user.save()
 
    res.status(200).json({ success: true, msg: 'Successfully created new user.' }); // 201 Created
  } catch (err) {
    if (err.code === 11000) { // Strict equality check (===)
      return res.status(409).json({ success: false, message: 'A user with that username already exists.' }); // 409 Conflict
    } else {
      console.error(err); // Log the error for debugging
      return res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' }); // 500 Internal Server Error
    }
  }
});
 
 
router.post('/signin', function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;
 
    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }
 
        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});
 
 
router.route('/movies/:movieId')
  .get(authJwtController.isAuthenticated, async (req, res) => {
      const id = req.params.movieId;
      try {
          let movie;
          if (req.query.reviews === "true") {
              const results = await Movie.aggregate([
                  { $match: { _id: new mongoose.Types.ObjectId(id) } },
                  {
                      $lookup: {
                          from: "reviews",
                          localField: "_id",
                          foreignField: "movieId",
                          as: "reviews"
                      }
                  },
                  {
                      $addFields: {
                          avgRating: {
                              $cond: {
                                  if: { $gt: [ { $size: "$reviews" }, 0 ] },
                                  then: { $avg: "$reviews.rating" },
                                  else: null
                              }
                          }
                      }
                  }
              ]);
              movie = results[0];
          } else {
              movie = await Movie.findById(id);
          }
 
          if (!movie) return res.status(404).json({ message: 'Movie not found.' });
          res.json(movie);
      } catch (err) {
          res.status(500).json({ message: err.message });
      }
  });
 
router.route('/movies')
.get(authJwtController.isAuthenticated, async (req, res) => {
    try {
        let movies;
        if (req.query.reviews === "true") {
            movies = await Movie.aggregate([
                {
                    $lookup: {
                        from: "reviews",
                        localField: "_id",
                        foreignField: "movieId",
                        as: "reviews"
                    }
                },
                {
                    $addFields: {
                        avgRating: {
                            $cond: {
                                if: { $gt: [ { $size: "$reviews" }, 0 ] },
                                then: { $avg: "$reviews.rating" },
                                else: null
                            }
                        }
                    }
                },
                {
                    $sort: { avgRating: -1, title: 1 }
                }
            ]);
        } else {
            movies = await Movie.find();
        }
        res.status(200).json(movies);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
})
  .post(authJwtController.isAuthenticated, async (req, res) => {
      const { title, genre, actors, releaseDate } = req.body;
 
      if (!title || !genre || !actors || actors.length === 0) {
          return res.status(400).json({ message: 'Title, genre, and actors are required.' });
      }
 
      try {
          const movie = new Movie({ title, genre, actors, releaseDate });
          const savedMovie = await movie.save();
          res.status(200).json({ movie: savedMovie });
      } catch (err) {
          res.status(500).json({ message: err.message });
      }
  });
 
  router.route('/movies/:movieId')
  .get(authJwtController.isAuthenticated, async (req, res) => {
    const id = req.params.movieId;  
    try {
          const movie = await Movie.findById(req.params.movieId);
          if (!movie) return res.status(404).json({ message: 'Movie not found.' });
          res.json(movie);
      } catch (err) {
          res.status(500).json({ message: err.message });
      }
  })
  .post(authJwtController.isAuthenticated, async (req, res) => {
      try {
          const movie = await Movie.findByIdAndUpdate(req.params.movieId, req.body, { new: true });
          if (!movie) return res.status(404).json({ message: 'Movie not found.' });
          res.json(movie);
      } catch (err) {
          res.status(500).json({ message: err.message });
      }
  })
  .delete(authJwtController.isAuthenticated, async (req, res) => {
      try {
          const movie = await Movie.findByIdAndDelete(req.params.movieId);
          if (!movie) return res.status(404).json({ message: 'Movie not found.' });
          res.json({ message: 'Movie deleted successfully.' });
      } catch (err) {
          res.status(500).json({ message: err.message });
      }
  });
 
 
  const Review = require('./Reviews');
 
  // Reviews routes
  router.route('/Reviews')
    // GET all reviews
    .get(authJwtController.isAuthenticated, async (req, res) => {
        try {
            const reviews = await Review.find().populate('movieId', 'title');
            res.status(200).json(reviews);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    })
 
    // POST create new review (JWT protected)
    .post(authJwtController.isAuthenticated, async (req, res) => {
        const { movieId, username, review, rating } = req.body;
 
        if (!movieId || !review || rating === undefined) {
            return res.status(400).json({ message: 'movieId, username, review, and rating are required.' });
        }
 
        try {
            const newReview = new Review({ movieId, username, review, rating });
            await newReview.save();
            res.status(200).json({ message: 'Review created!' });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    });
 
  // Optional: DELETE a review by ID (JWT protected)
  router.delete('/reviews/:reviewId', authJwtController.isAuthenticated, async (req, res) => {
    try {
        const review = await Review.findByIdAndDelete(req.params.reviewId);
        if (!review) return res.status(404).json({ message: 'Review not found.' });
        res.json({ message: 'Review deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
  });
 
 
 
app.use('/', router);
 
const PORT = process.env.PORT || 8080; // Define PORT before using it
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
 
module.exports = app; // for testing only
const router = require("express").Router();
 
const {
  register,
  login,
  guardLogout,
} = require("../controllers/authController");
const auth = require("../middleware/auth");
router.post("/register",auth(), register);
router.post("/login", login);
   
router.post("/logout", auth(["guard"]), guardLogout);
module.exports = router;

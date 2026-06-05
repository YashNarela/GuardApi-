const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/keys");
module.exports = (roles = []) => {
  return (req, res, next) => {
    console.log("Auth Middleware Invoked", req.body); // Debugging line

    try {
      const token = req.headers.authorization?.split(" ")[1];


      if (!token)
        return res
          .status(401)
          .json({ msg: "No token provided", success: false });
      const decoded = jwt.verify(token, jwtSecret);

  
      
      req.user = decoded;


      



      if (roles.length && !roles.includes(req.user.role))
        return res.status(403).json({ msg: "Forbidden", success: false });
      next();
    } catch (err) {
      res.status(401).json({ msg: "Invalid token", success: false });
    }
  };
};

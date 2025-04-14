import { getAuth } from 'firebase-admin/auth';

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer <token>"

  if (!token) {
    // Allow request to proceed if no token is provided for now?
    // OR send 401? For routes that *require* auth, lack of token is an error.
    // Let's assume routes using this *require* authentication.
    console.log('Auth Token: No token provided.');
    return res.status(401).json({ error: 'Authentication token required.' }); 
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = decodedToken; // Add decoded user info (uid, email, etc.) to the request object
    console.log(`Auth Token Verified: UID = ${decodedToken.uid}`);
    next(); // Pass control to the next handler
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error.code, error.message);
    // Handle specific Firebase Auth errors
    if (error.code === 'auth/id-token-expired') {
      return res.status(403).json({ error: 'Token expired. Please log in again.' });
    } else if (error.code === 'auth/argument-error') {
       return res.status(401).json({ error: 'Invalid token format.' });
    } else {
       return res.status(403).json({ error: 'Authentication failed.' }); // Token is invalid for other reasons
    }
  }
};

export default authenticateToken;

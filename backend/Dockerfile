# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy the rest of the backend source code
COPY . .

# Make port 8080 available to the world outside this container
# Cloud Run uses the PORT environment variable, often 8080
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "server.js" ]
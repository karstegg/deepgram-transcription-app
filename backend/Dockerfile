# Use the full Node.js 18 image which includes more common libraries
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Install ffmpeg system-wide and update PATH
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV PATH /usr/bin:${PATH} # <<< ADDED: Ensure /usr/bin is in PATH

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install only production dependencies
# Note: ffmpeg/ffprobe-static will still be installed via npm, but we primarily rely on the system install now
RUN npm install --only=production --ignore-scripts

# Copy the rest of the backend source code
COPY . .

# Make port 8080 available to the world outside this container
# Cloud Run uses the PORT environment variable, often 8080
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "server.js" ]

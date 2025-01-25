# Step 1: Build the React app
FROM node:23.6 AS build

# Set the working directory in the container
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the React app code
COPY . ./

# Build the app for production
RUN npm run build

# Step 2: Serve the app using a lightweight server
FROM nginx:alpine

# Copy the build folder to the nginx server
COPY --from=build /app/dist /usr/share/nginx/html

# Expose port 80 for the app
EXPOSE 80

# Start nginx server
CMD ["nginx", "-g", "daemon off;"]

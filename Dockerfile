# Use Ruby base image
FROM ruby:3.2-slim

# Install Node.js for building frontend
RUN apt-get update && apt-get install -y \
  curl \
  build-essential \
  && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy backend files
COPY Gemfile Gemfile.lock ./
RUN bundle install

# Copy frontend files and build
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
RUN npm install

COPY frontend/ ./
RUN npm run build

# Go back to app root and copy backend
WORKDIR /app
COPY app.rb ./
COPY public ./public

# Copy built frontend to public directory
RUN cp -r frontend/dist/* public/

# Expose port
EXPOSE 4567

# Start the server
CMD ["ruby", "app.rb", "-o", "0.0.0.0", "-p", "4567"]
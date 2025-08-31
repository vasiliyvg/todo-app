FROM node:20-alpine AS development

# Set working directory
WORKDIR /app

# Install dependencies (including dev dependencies for tests)
COPY package.json package-lock.json* ./
RUN npm install  # Remove --production flag to include dev deps

# Copy application code
COPY . .

# This stage can be used for development and testing

# Build stage
FROM development AS build
RUN npm run build

# # Production stage
# FROM nginx:alpine AS production
# COPY --from=build /app/build /usr/share/nginx/html

# EXPOSE 80

# CMD ["nginx", "-g", "daemon off;"]
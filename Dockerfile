FROM nginx:alpine
COPY horus-pwa/horus-pwa/ /usr/share/nginx/html/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM nginx:alpine
COPY horus-pwa/horus-pwa/horus-pwa/ /usr/share/nginx/html/
COPY horus-pwa/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

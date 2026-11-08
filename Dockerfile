FROM nginx:alpine
ENV RELEASE_ID=unknown
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY site/ /usr/share/nginx/html

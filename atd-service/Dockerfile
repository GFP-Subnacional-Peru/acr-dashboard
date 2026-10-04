# ---------- Compilación (no requiere JDK ni Maven instalados en la PC) ----------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B -DskipTests package

# ---------- Ejecución ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 atd
COPY --from=build /src/target/atd-service.jar app.jar
USER atd

# Render free = 512 MB: heap acotado, un solo hilo de GC y arranque rápido.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k -XX:MaxMetaspaceSize=128m"
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java -Dserver.port=${PORT:-8080} -jar app.jar"]

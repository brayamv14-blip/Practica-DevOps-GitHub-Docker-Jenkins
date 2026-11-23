pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        IMAGE_NAME     = 'puntobase'
        IMAGE_TAG      = "${env.BUILD_NUMBER}"
        CONTAINER_NAME = 'puntobase-ci'
        APP_PORT       = '3000'
        HOST_PORT      = '3100'
        CI             = 'true'
        NEXT_TELEMETRY_DISABLED = '1'
    }

    triggers {
        // Respaldo cuando no hay webhook: Jenkins revisa GitHub cada 5 minutos.
        // Con el webhook (/github-webhook/) el pipeline se dispara al instante con cada push.
        pollSCM('H/5 * * * *')
    }

    stages {

        stage('Checkout') {
            steps {
                // Obtiene automáticamente el código desde el repositorio de GitHub configurado en el job
                checkout scm
                sh 'git log -1 --pretty=format:"Commit: %h - %s (%an)"'
            }
        }

        stage('Pruebas') {
            steps {
                sh 'node --version && npm --version'
                // Instalación limpia y reproducible de dependencias (usa package-lock.json)
                sh 'npm ci'
                // Pruebas automatizadas con Vitest (API, modo sin conexión, sincronización, roles, reportes...)
                sh 'npm test'
            }
        }

        stage('Construir imagen Docker') {
            steps {
                // Usa el Dockerfile de la raíz del proyecto
                sh '''
                    docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest .
                    docker images ${IMAGE_NAME}
                '''
            }
        }

        stage('Ejecutar contenedor') {
            steps {
                // Variables de relleno: la verificación no necesita una base de datos real.
                // En un despliegue real se reemplazan por credenciales de Jenkins (--env-file / withCredentials).
                sh '''
                    docker rm -f ${CONTAINER_NAME} || true
                    docker run -d --name ${CONTAINER_NAME} \
                        -p ${HOST_PORT}:${APP_PORT} \
                        -e NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 \
                        -e SUPABASE_SERVICE_ROLE_KEY=ci-placeholder \
                        ${IMAGE_NAME}:${IMAGE_TAG}
                    docker ps --filter name=${CONTAINER_NAME}
                '''
            }
        }

        stage('Verificar aplicación') {
            steps {
                // Se consulta /api/health desde dentro del contenedor (no depende del puerto publicado en el anfitrión)
                sh '''
                    for i in $(seq 1 20); do
                        if docker exec ${CONTAINER_NAME} wget -qO- http://127.0.0.1:${APP_PORT}/api/health; then
                            echo ""
                            echo "La aplicación PuntoBase respondió correctamente."
                            exit 0
                        fi
                        echo "Esperando a que la aplicación inicie... intento $i de 20"
                        sleep 3
                    done
                    echo "La aplicación no respondió a tiempo."
                    docker logs ${CONTAINER_NAME}
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            echo "Pipeline exitoso: imagen ${IMAGE_NAME}:${IMAGE_TAG} construida y aplicación verificada."
        }
        failure {
            echo 'El pipeline falló. Revisa el log de la etapa marcada en rojo.'
            sh 'docker logs ${CONTAINER_NAME} || true'
        }
        always {
            // Se elimina el contenedor de prueba; la imagen se conserva para consulta
            sh 'docker rm -f ${CONTAINER_NAME} || true'
        }
    }
}

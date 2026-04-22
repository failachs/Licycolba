-- CreateTable
CREATE TABLE "ProcesoNuevo" (
    "id" SERIAL NOT NULL,
    "procesoId" INTEGER,
    "sourceKey" TEXT NOT NULL,
    "codigoProceso" TEXT,
    "nombre" TEXT,
    "entidad" TEXT,
    "objeto" TEXT,
    "fuente" TEXT,
    "aliasFuente" TEXT,
    "modalidad" TEXT,
    "perfil" TEXT,
    "departamento" TEXT,
    "estadoFuente" TEXT,
    "fechaPublicacion" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "valor" DOUBLE PRECISION,
    "linkDetalle" TEXT,
    "linkSecop" TEXT,
    "linkSecopReg" TEXT,
    "fechaDeteccion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcesoNuevo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcesoNuevo_sourceKey_key" ON "ProcesoNuevo"("sourceKey");

-- CreateIndex
CREATE INDEX "ProcesoNuevo_fechaDeteccion_idx" ON "ProcesoNuevo"("fechaDeteccion");

-- CreateIndex
CREATE INDEX "ProcesoNuevo_perfil_idx" ON "ProcesoNuevo"("perfil");

-- CreateIndex
CREATE INDEX "ProcesoNuevo_aliasFuente_idx" ON "ProcesoNuevo"("aliasFuente");

-- CreateIndex
CREATE INDEX "ProcesoNuevo_codigoProceso_idx" ON "ProcesoNuevo"("codigoProceso");

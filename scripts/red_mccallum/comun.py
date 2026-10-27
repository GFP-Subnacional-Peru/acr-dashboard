"""Red del artículo McCallum et al., Remote Sens. 2023, 15, 5204.

Ellos entrenaron ResNet18 sobre recortes Sentinel-2 en color y ganó a VGG16,
ResNet34 y MobileNetV2. La etiqueta publicada es binaria: hay deforestación
visible, o no. La localización dentro del recorte es un mapa de oclusión:
se tapa un cuadro de la imagen y se mide cuánto cae la probabilidad.

Aquí la misma ResNet18 aprende, además, la causa de la feature class
(cat_causa). Falsa alerta es la clase «no» del artículo. Confiabilidad alto
sale cuando la probabilidad de la causa llega a 0.80, el mismo umbral con
el que la mayoría de sus imágenes quedó en consenso.
"""
from __future__ import annotations

import torch
from torch import nn
from torchvision import models, transforms

# Mismos id y nombres que atd.cat_causa.
CAUSAS = {
    1: "Agricultura",
    2: "Ganadería",
    3: "Extracción forestal",
    4: "Extracción de fauna",
    5: "Hidrobiológicos",
    6: "Minería",
    7: "Hidrocarburos",
    8: "Turismo",
    9: "Energía",
    10: "Transporte",
    11: "Ocupación humana",
    12: "Restos arqueológicos",
    13: "Otros",
    14: "Natural",
    15: "Incendio antrópico",
    99: "Falsa alerta",
}
CAUSA_IDS = list(CAUSAS)
CAUSA_DE_IDX = {i: causa for i, causa in enumerate(CAUSA_IDS)}
IDX_DE_CAUSA = {causa: i for i, causa in CAUSA_DE_IDX.items()}
FALSA = 99
UMBRAL_ALTO = 0.80

# SGD con momento, como en la sección 2.7 del artículo.
LR = 1e-3
MOMENTO = 0.9
PESO_L2 = 5e-4
LOTE = 32
LADO = 224


def dispositivo():
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def transformar(entrenar: bool):
    pasos = [transforms.Resize((LADO, LADO))]
    if entrenar:
        pasos += [transforms.RandomHorizontalFlip(), transforms.RandomVerticalFlip()]
    pasos += [
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ]
    return transforms.Compose(pasos)


class RedMcCallum(nn.Module):
    """ResNet18. Una cabeza repite el sí/no del artículo; la otra da la causa."""

    def __init__(self):
        super().__init__()
        base = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        n = base.fc.in_features
        base.fc = nn.Identity()
        self.base = base
        self.deforestacion = nn.Linear(n, 2)
        self.causa = nn.Linear(n, len(CAUSA_IDS))

    def forward(self, x):
        h = self.base(x)
        return self.deforestacion(h), self.causa(h)


def cargar(ruta, device):
    red = RedMcCallum()
    estado = torch.load(ruta, map_location=device, weights_only=True)
    red.load_state_dict(estado["pesos"])
    red.to(device).eval()
    return red, estado


def leer_imagen(ruta, entrenar: bool):
    from PIL import Image

    return transformar(entrenar)(Image.open(ruta).convert("RGB"))

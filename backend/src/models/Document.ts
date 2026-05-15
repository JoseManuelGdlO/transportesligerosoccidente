import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
  type NonAttribute,
} from "sequelize";
import type { DocumentType } from "./DocumentType";

export class Document extends Model<InferAttributes<Document>, InferCreationAttributes<Document>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare document_type_id: string;
  declare documentable_type: "driver" | "truck";
  declare documentable_id: string;
  declare numero: CreationOptional<string | null>;
  declare vigencia_inicio: CreationOptional<string | null>;
  declare vigencia_fin: CreationOptional<string | null>;
  declare file_path: CreationOptional<string | null>;
  declare file_name: CreationOptional<string | null>;
  declare mime: CreationOptional<string | null>;
  declare size: CreationOptional<number | null>;
  declare notas: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;

  declare DocumentType?: NonAttribute<DocumentType>;
}

export function initDocument(sequelize: Sequelize) {
  Document.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      document_type_id: { type: DataTypes.CHAR(36), allowNull: false },
      documentable_type: { type: DataTypes.ENUM("driver", "truck"), allowNull: false },
      documentable_id: { type: DataTypes.CHAR(36), allowNull: false },
      numero: { type: DataTypes.TEXT, allowNull: true },
      vigencia_inicio: { type: DataTypes.DATEONLY, allowNull: true },
      vigencia_fin: { type: DataTypes.DATEONLY, allowNull: true },
      file_path: { type: DataTypes.TEXT, allowNull: true },
      file_name: { type: DataTypes.STRING(255), allowNull: true },
      mime: { type: DataTypes.STRING(128), allowNull: true },
      size: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
      notas: { type: DataTypes.TEXT, allowNull: true },
    } as never,
    { sequelize, tableName: "documents", underscored: true },
  );
}

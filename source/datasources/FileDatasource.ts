import fs from "fs";
import path from "path";
import pify from "pify";
import TextDatasource from "./TextDatasource";
import { fireInstantiationHandlers, registerDatasource } from "./register";
import Credentials from "../credentials/Credentials";
import { getCredentials } from "../credentials/channel";
import { ATTACHMENT_EXT, decryptAttachment, encryptAttachment } from "../tools/attachments";
import { AttachmentDetails, BufferLike, DatasourceLoadedData, EncryptedContent, History, VaultID } from "../types";

/**
 * File datasource for loading and saving files
 * @augments TextDatasource
 * @memberof module:Buttercup
 */
export default class FileDatasource extends TextDatasource {
    _filename: string;
    mkdir: Function;
    readFile: Function;
    stat: Function;
    unlink: Function;
    writeFile: Function;

    /**
     * Constructor for the file datasource
     * @param credentials The credentials instance with which to
     *  use to configure the datasource
     */
    constructor(credentials: Credentials) {
        super(credentials);
        const { data: credentialData } = getCredentials(credentials.id);
        const { datasource: datasourceConfig } = credentialData;
        const { path } = datasourceConfig;
        this._filename = path;
        this.mkdir = pify(fs.mkdir);
        this.readFile = pify(fs.readFile);
        this.stat = pify(fs.stat);
        this.unlink = pify(fs.unlink);
        this.writeFile = pify(fs.writeFile);
        this.type = "file";
        fireInstantiationHandlers("file", this);
    }

    get baseDir(): string {
        return path.dirname(this.path);
    }

    /**
     * The file path
     * @memberof FileDatasource
     */
    get path() {
        return this._filename;
    }

    /**
     * Ensure attachment paths exist
     * @memberof FileDatasource
     * @protected
     */
    async _ensureAttachmentsPaths(vaultID: VaultID): Promise<void> {
        const attachmentsDir = path.join(this.baseDir, ".buttercup", vaultID);
        await this.mkdir(attachmentsDir, { recursive: true });
    }

    /**
     * Get attachment buffer
     * - Loads the attachment contents from a file into a buffer
     * @param vaultID The ID of the vault
     * @param attachmentID The ID of the attachment
     * @param credentials Credentials to decrypt
     *  the buffer, defaults to null (no decryption)
     * @memberof FileDatasource
     */
    async getAttachment(vaultID: VaultID, attachmentID: string, credentials: Credentials = null): Promise<BufferLike> {
        await this._ensureAttachmentsPaths(vaultID);
        const attachmentPath = path.join(this.baseDir, ".buttercup", vaultID, `${attachmentID}.${ATTACHMENT_EXT}`);
        const data = await this.readFile(attachmentPath);
        return credentials ? decryptAttachment(data, credentials) : data;
    }

    /**
     * Get attachment details
     * @param vaultID The ID of the vault
     * @param attachmentID The ID of the attachment
     * @returns The attachment details
     * @memberof FileDatasource
     */
    async getAttachmentDetails(vaultID: VaultID, attachmentID: string): Promise<AttachmentDetails> {
        await this._ensureAttachmentsPaths(vaultID);
        const filename = `${attachmentID}.${ATTACHMENT_EXT}`;
        const filePath = path.join(this.baseDir, ".buttercup", vaultID, filename);
        const fileStat = await this.stat(filePath);
        return {
            id: attachmentID,
            vaultID,
            name: filename,
            filename: filePath,
            size: fileStat.size,
            mime: null
        };
    }

    /**
     * Load from the filename specified in the constructor using a password
     * @param credentials The credentials for decryption
     * @returns A promise resolving with archive history
     * @memberof FileDatasource
     */
    load(credentials: Credentials): Promise<DatasourceLoadedData> {
        return this.hasContent
            ? super.load(credentials)
            : this.readFile(this.path, "utf8").then(contents => {
                  this.setContent(contents);
                  return super.load(credentials);
              });
    }

    /**
     * Put attachment data
     * @param vaultID The ID of the vault
     * @param attachmentID The ID of the attachment
     * @param buffer The attachment data
     * @param credentials Credentials for
     *  encrypting the buffer. If not provided, the buffer
     *  is presumed to be in encrypted-form and will be
     *  written as-is.
     * @memberof FileDatasource
     */
    async putAttachment(vaultID: VaultID, attachmentID: string, buffer: BufferLike, credentials: Credentials = null): Promise<void> {
        await this._ensureAttachmentsPaths(vaultID);
        const attachmentPath = path.join(this.baseDir, ".buttercup", vaultID, `${attachmentID}.${ATTACHMENT_EXT}`);
        let data = buffer;
        if (credentials) {
            data = await encryptAttachment(data, credentials);
        }
        await this.writeFile(attachmentPath, data);
    }

    /**
     * Remove an attachment
     * @param vaultID The ID of the vault
     * @param attachmentID The ID of the attachment
     * @memberof FileDatasource
     */
    async removeAttachment(vaultID: VaultID, attachmentID: string): Promise<void> {
        await this._ensureAttachmentsPaths(vaultID);
        const attachmentPath = path.join(this.baseDir, ".buttercup", vaultID, `${attachmentID}.${ATTACHMENT_EXT}`);
        await this.unlink(attachmentPath);
    }

    /**
     * Save archive history to a file
     * @param history The archive history to save
     * @param credentials The credentials to save with
     * @returns A promise that resolves when saving is complete
     * @memberof FileDatasource
     */
    save(history: History, credentials: Credentials): Promise<EncryptedContent> {
        return super.save(history, credentials).then(encrypted => this.writeFile(this.path, encrypted));
    }

    /**
     * Whether or not the datasource supports attachments
     * @memberof FileDatasource
     */
    supportsAttachments(): boolean {
        return true;
    }

    /**
     * Whether or not the datasource supports bypassing remote fetch operations
     * @returns True if content can be set to bypass fetch operations,
     *  false otherwise
     * @memberof FileDatasource
     */
    supportsRemoteBypass(): boolean {
        return true;
    }
}

registerDatasource("file", FileDatasource);